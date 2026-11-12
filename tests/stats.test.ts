import { describe, expect, it } from 'vitest';
import { teamHistory, summarize, restDays } from '../shared/stats';
import { checkFdPath } from '../shared/providers/fdPaths';
import type { Fixture } from '../shared/types';

const fx = (id: number, iso: string, home: string, away: string, ft: [number, number], ht?: [number, number]): Fixture => ({
  id: `fd:${id}`, provider: 'football-data.org', kickoffUtc: iso, status: 'finished', rawStatus: 'FINISHED',
  competition: { id: 'c', name: 'League', code: 'PL' }, home: { id: home, name: home }, away: { id: away, name: away },
  fullTime: { home: ft[0], away: ft[1] }, halfTime: ht ? { home: ht[0], away: ht[1] } : undefined,
});

describe('team history and form', () => {
  const list = [
    fx(1, '2026-10-01T15:00:00Z', 'X', 'Y', [2, 1], [1, 0]),
    fx(2, '2026-10-08T15:00:00Z', 'Z', 'X', [0, 0]),
    fx(3, '2026-10-15T15:00:00Z', 'X', 'Z', [1, 3], [0, 2]),
    fx(3, '2026-10-15T15:00:00Z', 'X', 'Z', [1, 3], [0, 2]), // duplicate
    fx(4, '2026-11-20T15:00:00Z', 'X', 'Y', [5, 0]), // after kickoff
  ];
  const h = teamHistory(list, 'X', '2026-11-01T00:00:00Z');

  it('dedupes, excludes future matches and sorts newest first', () => {
    expect(h.map((m) => m.fixture.id)).toEqual(['fd:3', 'fd:2', 'fd:1']);
  });
  it('summarizes from the team perspective', () => {
    const s = summarize(h);
    expect([s.w, s.d, s.l, s.gf, s.ga, s.cleanSheets, s.failedToScore, s.btts]).toEqual([1, 1, 1, 3, 4, 1, 1, 2]);
  });
  it('counts half-time stats only where a half-time score exists', () => {
    const s = summarize(h);
    expect(s.htN).toBe(2);
    expect(s.htGf).toBe(1);
    expect(s.secondHalfGf).toBe(2);
  });
  it('computes rest days', () => {
    expect(restDays(h, '2026-10-18T15:00:00Z')).toBe(3);
    expect(restDays([], '2026-10-18T15:00:00Z')).toBeNull();
  });
});

describe('data gateway whitelist', () => {
  it('allows only known read-only paths', () => {
    expect(checkFdPath('/matches/123').ok).toBe(true);
    expect(checkFdPath('/matches/123/head2head?limit=50').ok).toBe(true);
    expect(checkFdPath('/teams/57/matches?status=FINISHED&limit=40').ok).toBe(true);
    expect(checkFdPath('/competitions/PL/matches?season=2026&status=FINISHED').ok).toBe(true);
    expect(checkFdPath('/persons/1').ok).toBe(false);
    expect(checkFdPath('https://evil.example').ok).toBe(false);
    expect(checkFdPath('/matches/1?x=1').ok).toBe(false);
  });
});
