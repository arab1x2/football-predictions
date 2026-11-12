import { describe, expect, it } from 'vitest';
import { buildPicks, strengthOf } from '../shared/model/picks';
import { marketsFromMatrix } from '../shared/model/markets';
import { scoreMatrix } from '../shared/model/poisson';

describe('picks', () => {
  const picks = buildPicks(marketsFromMatrix(scoreMatrix(1.19, 2.22), 'Atalanta', 'Inter'));
  it('picks the favourite and its double chance', () => {
    expect(picks.result.pick).toBe('Inter win');
    expect(picks.doubleChance.pick).toBe('Inter or draw (X2)');
    expect(picks.doubleChance.p).toBeGreaterThan(picks.result.p);
  });
  it('never reports certainty', () => {
    for (const p of [picks.result, picks.doubleChance, ...picks.picks]) expect(p.p).toBeLessThan(1);
  });
  it('labels strength by fixed thresholds', () => {
    expect(strengthOf(0.8)).toBe('strong');
    expect(strengthOf(0.65)).toBe('good');
    expect(strengthOf(0.55)).toBe('lean');
    expect(strengthOf(0.5)).toBe('coin-flip');
  });
});

describe('picks list', () => {
  it('has no duplicate markets', () => {
    const p = buildPicks(marketsFromMatrix(scoreMatrix(1.3, 1.1), 'H', 'A')).picks.map((x) => x.market);
    expect(new Set(p).size).toBe(p.length);
    expect(p.length).toBe(6);
  });
});
