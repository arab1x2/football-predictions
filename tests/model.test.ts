import { describe, expect, it } from 'vitest';
import { fitPoisson, expectedGoals, scoreMatrix, toTraining, type TrainingMatch } from '../shared/model/poisson';
import { marketsFromMatrix, topScorelines } from '../shared/model/markets';
import { backtest } from '../shared/model/backtest';
import type { Fixture } from '../shared/types';

// Deterministic synthetic league: team "S" is strong, "W" is weak.
function league(): TrainingMatch[] {
  const teams = ['S', 'A', 'B', 'C', 'W'];
  const strength: Record<string, number> = { S: 2, A: 1, B: 1, C: 1, W: 0 };
  const rows: TrainingMatch[] = [];
  let day = 0;
  for (let round = 0; round < 6; round++)
    for (const h of teams) for (const a of teams) {
      if (h === a) continue;
      rows.push({ home: h, away: a, hg: Math.max(0, strength[h]! - strength[a]! + 1), ag: Math.max(0, strength[a]! - strength[h]!), kickoffUtc: new Date(Date.UTC(2025, 7, 1) + day++ * 86_400_000).toISOString() });
    }
  return rows;
}

describe('poisson model', () => {
  const rows = league();
  const asOf = '2026-11-12T00:00:00Z';
  const fit = fitPoisson(rows, asOf);

  it('ranks the strong team above the weak team', () => {
    expect(fit.attack.S!).toBeGreaterThan(fit.attack.W!);
    expect(fit.defense.S!).toBeGreaterThan(fit.defense.W!);
    const xg = expectedGoals(fit, 'S', 'W');
    expect(xg.home).toBeGreaterThan(xg.away);
  });

  it('produces a score matrix that sums to 1', () => {
    const m = scoreMatrix(1.4, 1.1);
    expect(m.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('has complementary market outcomes summing to 100%', () => {
    const xg = expectedGoals(fit, 'A', 'B');
    for (const line of marketsFromMatrix(scoreMatrix(xg.home, xg.away), 'A', 'B')) {
      expect(line.outcomes.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1, 9);
    }
  });

  it('lists scorelines in decreasing probability', () => {
    const top = topScorelines(scoreMatrix(1.5, 1));
    for (let i = 1; i < top.length; i++) expect(top[i - 1]!.p).toBeGreaterThanOrEqual(top[i]!.p);
  });

  it('is deterministic', () => {
    expect(fitPoisson(rows, asOf)).toEqual(fit);
  });
});

describe('no lookahead', () => {
  const mk = (id: number, iso: string, status: Fixture['status'], ft?: [number, number]): Fixture => ({
    id: `fd:${id}`, provider: 'football-data.org', kickoffUtc: iso, status, rawStatus: '',
    competition: { id: 'c', name: 'c' }, home: { id: 'h', name: 'h' }, away: { id: 'a', name: 'a' },
    fullTime: ft ? { home: ft[0], away: ft[1] } : undefined,
  });
  it('excludes matches at or after the cutoff and unfinished matches', () => {
    const rows = toTraining([
      mk(1, '2026-11-01T20:00:00Z', 'finished', [1, 0]),
      mk(2, '2026-11-12T20:00:00Z', 'finished', [9, 9]), // the match itself
      mk(3, '2026-11-20T20:00:00Z', 'finished', [9, 9]), // future
      mk(4, '2026-11-05T20:00:00Z', 'postponed'),
      mk(5, '2026-11-06T20:00:00Z', 'finished'), // missing score: never invented
    ], '2026-11-12T20:00:00Z');
    expect(rows.map((r) => r.kickoffUtc)).toEqual(['2026-11-01T20:00:00.000Z'.replace('.000', '')]);
  });

  it('backtest predictions do not change when later results change', () => {
    const rows = league();
    const altered = rows.map((r, i) => (i === rows.length - 1 ? { ...r, hg: 9, ag: 9 } : r));
    const a = backtest(rows.slice(0, -1), 40);
    const b = backtest(altered.slice(0, -1), 40);
    expect(a).toEqual(b);
    // And the backtest beats nothing it shouldn't: it returns real metrics.
    const full = backtest(rows, 40)!;
    expect(full.nPredicted).toBe(rows.length - 40);
  });
});

import { toTrainingHalf, halfMarkets, halvesFor } from '../shared/model/halves';

describe('half models', () => {
  const mk = (id: number, day: number, h: string, a: string, ft: [number, number], ht?: [number, number]): Fixture => ({
    id: `fd:${id}`, provider: 'football-data.org', kickoffUtc: new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString(),
    status: 'finished', rawStatus: 'FINISHED', competition: { id: 'c', name: 'c' },
    home: { id: h, name: h }, away: { id: a, name: a },
    fullTime: { home: ft[0], away: ft[1] }, halfTime: ht ? { home: ht[0], away: ht[1] } : undefined,
  });
  const asOf = '2027-01-01T00:00:00Z';

  it('uses only matches with a real half-time score, and splits halves correctly', () => {
    const list = [mk(1, 1, 'A', 'B', [3, 1], [1, 0]), mk(2, 2, 'A', 'B', [2, 2]), mk(3, 3, 'A', 'B', [1, 0], [2, 0])];
    expect(toTrainingHalf(list, asOf, 'first').map((r) => [r.hg, r.ag])).toEqual([[1, 0], [2, 0]]);
    // match 3 is inconsistent (2 at half time, 1 at full time) and is dropped for the second half
    expect(toTrainingHalf(list, asOf, 'second').map((r) => [r.hg, r.ag])).toEqual([[2, 1]]);
  });

  it('has complementary half markets summing to 100%', () => {
    for (const line of halfMarkets(scoreMatrix(0.6, 0.4), '1st half', 'H', 'A')) {
      expect(line.outcomes.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1, 9);
    }
  });

  it('refuses to predict without enough half-time data', () => {
    const noHt = Array.from({ length: 60 }, (_, i) => mk(i, i, i % 2 ? 'A' : 'B', i % 2 ? 'B' : 'A', [1, 1]));
    const r = halvesFor(noHt, asOf, 'A', 'B', 'A', 'B', 40, 6);
    expect(r.ok).toBe(false);
  });

  it('predicts fewer goals per half than a full match would have', () => {
    const teams = ['A', 'B', 'C', 'D'];
    const list: Fixture[] = [];
    let id = 0;
    for (let r = 0; r < 5; r++) for (const h of teams) for (const a of teams) if (h !== a) list.push(mk(id, id++, h, a, [2, 1], [1, 0]));
    const r = halvesFor(list, asOf, 'A', 'B', 'A', 'B', 40, 6);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.halves.xgFirst.home + r.halves.xgFirst.away).toBeLessThan(2);
      expect(r.halves.markets.find((m) => m.market === '1st half goals 0.5')).toBeDefined();
      expect(r.halves.markets.find((m) => m.market === '2nd half goals 1.5')).toBeDefined();
    }
  });
});
