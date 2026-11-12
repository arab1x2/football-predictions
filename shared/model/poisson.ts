// Regularized, time-weighted Poisson goals model (Maher / Dixon-Coles style,
// without the low-score correction, which is not yet validated here).
//
//   log(lambda_home) = mu + homeAdv + attack[home] - defense[away]
//   log(lambda_away) = mu           + attack[away] - defense[home]
//
// Fitted by Newton updates on the weighted log-likelihood with an L2 penalty
// that shrinks every team toward the league average (0). Deterministic.
import type { Fixture } from '../types';

export const MODEL_VERSION = 'poisson-0.1';

export interface FitOptions {
  /** Older matches count less: weight = 0.5 ^ (ageDays / halfLifeDays). */
  halfLifeDays: number;
  /** Strength of shrinkage toward the league average. */
  l2: number;
  rounds: number;
}

export const DEFAULT_FIT: FitOptions = { halfLifeDays: 180, l2: 1.5, rounds: 60 };

export interface TrainingMatch {
  home: string;
  away: string;
  hg: number;
  ag: number;
  kickoffUtc: string;
}

export interface PoissonFit {
  version: string;
  mu: number;
  homeAdv: number;
  attack: Record<string, number>;
  defense: Record<string, number>;
  matchesPerTeam: Record<string, number>;
  nMatches: number;
  options: FitOptions;
  asOf: string;
}

/** Usable training rows: finished, scored, and strictly before `asOf` (no lookahead). */
export function toTraining(fixtures: Fixture[], asOf: string): TrainingMatch[] {
  const cutoff = Date.parse(asOf);
  const out: TrainingMatch[] = [];
  for (const f of fixtures) {
    if (f.status !== 'finished') continue;
    if (Date.parse(f.kickoffUtc) >= cutoff) continue;
    const hg = f.fullTime?.home;
    const ag = f.fullTime?.away;
    if (hg == null || ag == null) continue;
    out.push({ home: f.home.id, away: f.away.id, hg, ag, kickoffUtc: f.kickoffUtc });
  }
  return out;
}

export function fitPoisson(rows: TrainingMatch[], asOf: string, opts: FitOptions = DEFAULT_FIT): PoissonFit {
  const now = Date.parse(asOf);
  const w = rows.map((r) => Math.pow(0.5, Math.max(0, now - Date.parse(r.kickoffUtc)) / 86_400_000 / opts.halfLifeDays));
  const teams = new Set<string>();
  const count: Record<string, number> = {};
  for (const r of rows) {
    teams.add(r.home);
    teams.add(r.away);
    count[r.home] = (count[r.home] ?? 0) + 1;
    count[r.away] = (count[r.away] ?? 0) + 1;
  }
  const att: Record<string, number> = {};
  const def: Record<string, number> = {};
  for (const t of teams) {
    att[t] = 0;
    def[t] = 0;
  }
  const totalW = w.reduce((a, b) => a + b, 0);
  const meanGoals = totalW > 0 ? rows.reduce((s, r, i) => s + w[i]! * (r.hg + r.ag), 0) / (2 * totalW) : 1.3;
  let mu = Math.log(Math.max(meanGoals, 0.1));
  let h = 0.2;

  const lam = (i: number) => {
    const r = rows[i]!;
    return [
      Math.exp(mu + h + att[r.home]! - def[r.away]!),
      Math.exp(mu + att[r.away]! - def[r.home]!),
    ] as const;
  };

  for (let round = 0; round < opts.rounds; round++) {
    // mu and home advantage (unpenalized)
    {
      let g = 0, H = 0, gh = 0, Hh = 0;
      for (let i = 0; i < rows.length; i++) {
        const [lh, la] = lam(i);
        const r = rows[i]!, wi = w[i]!;
        g += wi * (r.hg - lh + r.ag - la);
        H += wi * (lh + la);
        gh += wi * (r.hg - lh);
        Hh += wi * lh;
      }
      if (H > 0) mu += g / H;
      if (Hh > 0) h += gh / Hh;
    }
    for (const t of teams) {
      let ga = -2 * opts.l2 * att[t]!, Ha = 2 * opts.l2;
      let gd = -2 * opts.l2 * def[t]!, Hd = 2 * opts.l2;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        if (r.home !== t && r.away !== t) continue;
        const [lh, la] = lam(i);
        const wi = w[i]!;
        if (r.home === t) {
          ga += wi * (r.hg - lh); Ha += wi * lh; // attack while home
          gd += -wi * (r.ag - la); Hd += wi * la; // defense while home
        } else {
          ga += wi * (r.ag - la); Ha += wi * la;
          gd += -wi * (r.hg - lh); Hd += wi * lh;
        }
      }
      att[t] = att[t]! + ga / Ha;
      def[t] = def[t]! + gd / Hd;
    }
    // Identifiability: keep average attack and defense at zero.
    const n = teams.size || 1;
    const ma = Object.values(att).reduce((a, b) => a + b, 0) / n;
    const md = Object.values(def).reduce((a, b) => a + b, 0) / n;
    for (const t of teams) {
      att[t] = att[t]! - ma;
      def[t] = def[t]! - md;
    }
    mu += ma - md;
  }

  return { version: MODEL_VERSION, mu, homeAdv: h, attack: att, defense: def, matchesPerTeam: count, nMatches: rows.length, options: opts, asOf };
}

export function expectedGoals(fit: PoissonFit, home: string, away: string): { home: number; away: number } {
  return {
    home: Math.exp(fit.mu + fit.homeAdv + (fit.attack[home] ?? 0) - (fit.defense[away] ?? 0)),
    away: Math.exp(fit.mu + (fit.attack[away] ?? 0) - (fit.defense[home] ?? 0)),
  };
}

function poissonPmf(lambda: number, max: number): number[] {
  const p = [Math.exp(-lambda)];
  for (let k = 1; k <= max; k++) p.push(p[k - 1]! * lambda / k);
  return p;
}

/** P(home = i, away = j) for i, j in 0..max, renormalized to sum to 1. */
export function scoreMatrix(lh: number, la: number, max = 10): number[][] {
  const ph = poissonPmf(lh, max);
  const pa = poissonPmf(la, max);
  const m = ph.map((a) => pa.map((b) => a * b));
  const total = m.flat().reduce((s, x) => s + x, 0);
  return m.map((row) => row.map((x) => x / total));
}
