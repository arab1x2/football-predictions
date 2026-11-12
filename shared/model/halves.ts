// Separate Poisson models for first-half and second-half goals. Each is
// fitted on real half scores only (second half = full time minus half time).
// Matches without a half-time score are left out, never estimated.
import type { Fixture } from '../types';
import { fitPoisson, expectedGoals, scoreMatrix, type TrainingMatch } from './poisson';
import type { MarketLine } from './markets';

export type Half = 'first' | 'second';

export function toTrainingHalf(fixtures: Fixture[], asOf: string, half: Half): TrainingMatch[] {
  const cutoff = Date.parse(asOf);
  const out: TrainingMatch[] = [];
  for (const f of fixtures) {
    if (f.status !== 'finished' || Date.parse(f.kickoffUtc) >= cutoff) continue;
    const ft = f.fullTime, ht = f.halfTime;
    if (!ft || !ht || ft.home == null || ft.away == null || ht.home == null || ht.away == null) continue;
    const hg = half === 'first' ? ht.home : ft.home - ht.home;
    const ag = half === 'first' ? ht.away : ft.away - ht.away;
    if (hg < 0 || ag < 0) continue; // inconsistent record
    out.push({ home: f.home.id, away: f.away.id, hg, ag, kickoffUtc: f.kickoffUtc });
  }
  return out;
}

function sum(m: number[][], pred: (h: number, a: number) => boolean): number {
  let s = 0;
  m.forEach((row, h) => row.forEach((p, a) => { if (pred(h, a)) s += p; }));
  return s;
}

export function halfMarkets(m: number[][], prefix: string, homeName: string, awayName: string): MarketLine[] {
  const lines: MarketLine[] = [
    {
      market: `${prefix} result`,
      outcomes: [
        { label: `${homeName} ahead`, p: sum(m, (h, a) => h > a) },
        { label: 'Level', p: sum(m, (h, a) => h === a) },
        { label: `${awayName} ahead`, p: sum(m, (h, a) => h < a) },
      ],
    },
  ];
  for (const t of [0.5, 1.5, 2.5]) {
    lines.push({
      market: `${prefix} goals ${t}`,
      outcomes: [{ label: `Over ${t}`, p: sum(m, (h, a) => h + a > t) }, { label: `Under ${t}`, p: sum(m, (h, a) => h + a < t) }],
    });
  }
  lines.push({ market: `${prefix}: ${homeName} scores`, outcomes: [{ label: 'Yes', p: sum(m, (h) => h > 0) }, { label: 'No', p: sum(m, (h) => h === 0) }] });
  lines.push({ market: `${prefix}: ${awayName} scores`, outcomes: [{ label: 'Yes', p: sum(m, (_h, a) => a > 0) }, { label: 'No', p: sum(m, (_h, a) => a === 0) }] });
  return lines;
}

export interface HalvesOutput {
  markets: MarketLine[];
  xgFirst: { home: number; away: number };
  xgSecond: { home: number; away: number };
  nMatches: number;
}

/**
 * Fits both half models and returns their markets, or a reason why not.
 * `minLeague` / `minTeam` are the same sample-size rules as the full-time model.
 */
export function halvesFor(
  league: Fixture[], asOf: string, homeId: string, awayId: string, homeName: string, awayName: string,
  minLeague: number, minTeam: number,
): { ok: true; halves: HalvesOutput } | { ok: false; reason: string } {
  const first = toTrainingHalf(league, asOf, 'first');
  const second = toTrainingHalf(league, asOf, 'second');
  const n = Math.min(first.length, second.length);
  const count = (id: string) => first.filter((r) => r.home === id || r.away === id).length;
  if (n < minLeague) return { ok: false, reason: `Only ${n} league matches have a half-time score (at least ${minLeague} needed).` };
  if (count(homeId) < minTeam || count(awayId) < minTeam) return { ok: false, reason: 'Not enough matches with a half-time score for both teams.' };
  const f1 = fitPoisson(first, asOf);
  const f2 = fitPoisson(second, asOf);
  const x1 = expectedGoals(f1, homeId, awayId);
  const x2 = expectedGoals(f2, homeId, awayId);
  return {
    ok: true,
    halves: {
      markets: [
        ...halfMarkets(scoreMatrix(x1.home, x1.away), '1st half', homeName, awayName),
        ...halfMarkets(scoreMatrix(x2.home, x2.away), '2nd half', homeName, awayName),
      ],
      xgFirst: x1, xgSecond: x2, nMatches: n,
    },
  };
}
