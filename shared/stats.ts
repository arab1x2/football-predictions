// Descriptive statistics from real match records only. Any value that needs
// data we don't have (e.g. half-time scores) is reported with its own sample
// size, or as null when no record has it.
import type { Fixture } from './types';

export interface TeamMatchView {
  fixture: Fixture;
  venue: 'home' | 'away';
  opponent: string;
  gf: number;
  ga: number;
  htGf: number | null;
  htGa: number | null;
  result: 'W' | 'D' | 'L';
}

/** Finished matches of a team before `before`, newest first. */
export function teamHistory(fixtures: Fixture[], teamId: string, before: string): TeamMatchView[] {
  const cutoff = Date.parse(before);
  const seen = new Set<string>();
  const out: TeamMatchView[] = [];
  for (const f of fixtures) {
    if (seen.has(f.id)) continue;
    if (f.status !== 'finished' || Date.parse(f.kickoffUtc) >= cutoff) continue;
    if (f.home.id !== teamId && f.away.id !== teamId) continue;
    const ft = f.fullTime;
    if (!ft || ft.home == null || ft.away == null) continue;
    seen.add(f.id);
    const home = f.home.id === teamId;
    const gf = home ? ft.home : ft.away;
    const ga = home ? ft.away : ft.home;
    const ht = f.halfTime;
    const hasHt = ht && ht.home != null && ht.away != null;
    out.push({
      fixture: f,
      venue: home ? 'home' : 'away',
      opponent: home ? f.away.name : f.home.name,
      gf,
      ga,
      htGf: hasHt ? (home ? ht.home : ht.away) : null,
      htGa: hasHt ? (home ? ht.away : ht.home) : null,
      result: gf > ga ? 'W' : gf === ga ? 'D' : 'L',
    });
  }
  return out.sort((a, b) => b.fixture.kickoffUtc.localeCompare(a.fixture.kickoffUtc));
}

export interface FormSummary {
  n: number;
  w: number;
  d: number;
  l: number;
  points: number;
  gf: number;
  ga: number;
  cleanSheets: number;
  failedToScore: number;
  btts: number;
  over15: number;
  over25: number;
  over35: number;
  /** Half-time figures only over matches that have a half-time score. */
  htN: number;
  htGf: number;
  htGa: number;
  secondHalfGf: number;
  secondHalfGa: number;
}

export function summarize(list: TeamMatchView[]): FormSummary {
  const s: FormSummary = { n: list.length, w: 0, d: 0, l: 0, points: 0, gf: 0, ga: 0, cleanSheets: 0, failedToScore: 0, btts: 0, over15: 0, over25: 0, over35: 0, htN: 0, htGf: 0, htGa: 0, secondHalfGf: 0, secondHalfGa: 0 };
  for (const m of list) {
    if (m.result === 'W') s.w++; else if (m.result === 'D') s.d++; else s.l++;
    s.gf += m.gf; s.ga += m.ga;
    if (m.ga === 0) s.cleanSheets++;
    if (m.gf === 0) s.failedToScore++;
    if (m.gf > 0 && m.ga > 0) s.btts++;
    const t = m.gf + m.ga;
    if (t > 1.5) s.over15++;
    if (t > 2.5) s.over25++;
    if (t > 3.5) s.over35++;
    if (m.htGf != null && m.htGa != null) {
      s.htN++; s.htGf += m.htGf; s.htGa += m.htGa;
      s.secondHalfGf += m.gf - m.htGf; s.secondHalfGa += m.ga - m.htGa;
    }
  }
  s.points = s.w * 3 + s.d;
  return s;
}

export function windows(list: TeamMatchView[]) {
  return {
    last5: summarize(list.slice(0, 5)),
    last10: summarize(list.slice(0, 10)),
    last20: summarize(list.slice(0, 20)),
    home: summarize(list.filter((m) => m.venue === 'home')),
    away: summarize(list.filter((m) => m.venue === 'away')),
  };
}

/** Whole days between the team's last match and the kickoff. */
export function restDays(list: TeamMatchView[], kickoffUtc: string): number | null {
  const last = list[0];
  if (!last) return null;
  return Math.floor((Date.parse(kickoffUtc) - Date.parse(last.fixture.kickoffUtc)) / 86_400_000);
}
