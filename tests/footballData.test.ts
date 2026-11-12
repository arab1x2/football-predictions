import { describe, expect, it } from 'vitest';
import { mapStatus, normalizeMatch, normalizeMatches, type FdMatch } from '../shared/providers/footballData';
import { filterToLocalDate, utcQueryWindow } from '../shared/fixturesForDate';

const base: FdMatch = {
  id: 1,
  utcDate: '2026-11-12T20:00:00Z',
  status: 'TIMED',
  competition: { id: 2021, name: 'Premier League', code: 'PL' },
  area: { name: 'England' },
  homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS' },
  awayTeam: { id: 61, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE' },
  score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
};

describe('football-data.org adapter', () => {
  it('maps statuses', () => {
    expect(mapStatus('TIMED')).toBe('scheduled');
    expect(mapStatus('PAUSED')).toBe('live');
    expect(mapStatus('AWARDED')).toBe('finished');
    expect(mapStatus('POSTPONED')).toBe('postponed');
    expect(mapStatus('WHATEVER')).toBe('unknown');
  });
  it('normalizes an upcoming match with no score', () => {
    const f = normalizeMatch(base)!;
    expect(f.id).toBe('fd:1');
    expect(f.status).toBe('scheduled');
    expect(f.fullTime).toBeUndefined();
    expect(f.halfTime).toBeUndefined();
  });
  it('keeps real scores for finished matches', () => {
    const f = normalizeMatch({ ...base, status: 'FINISHED', score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } } })!;
    expect(f.fullTime).toEqual({ home: 2, away: 1 });
    expect(f.halfTime).toEqual({ home: 1, away: 0 });
  });
  it('never invents a half-time score when it is missing', () => {
    const f = normalizeMatch({ ...base, status: 'FINISHED', score: { fullTime: { home: 2, away: 1 } } })!;
    expect(f.halfTime).toBeUndefined();
  });
  it('drops records with missing essentials and tolerates missing teams', () => {
    expect(normalizeMatch({ ...base, id: undefined })).toBeNull();
    expect(normalizeMatch({ ...base, utcDate: 'not a date' })).toBeNull();
    expect(normalizeMatch({ ...base, homeTeam: undefined })!.home.name).toBe('Unknown team');
  });
  it('removes duplicates and sorts by kickoff', () => {
    const list = normalizeMatches([
      { ...base, id: 2, utcDate: '2026-11-12T21:00:00Z' },
      base,
      base,
    ]);
    expect(list.map((f) => f.id)).toEqual(['fd:1', 'fd:2']);
  });
});

describe('fixtures for a local date', () => {
  it('queries a window around the date', () => {
    expect(utcQueryWindow('2026-11-12')).toEqual({ dateFrom: '2026-11-11', dateTo: '2026-11-13' });
  });
  it('keeps only matches on the local date', () => {
    const list = normalizeMatches([
      { ...base, id: 1, utcDate: '2026-11-11T23:30:00Z' }, // 00:30 on the 12th at UTC+1
      { ...base, id: 2, utcDate: '2026-11-12T20:00:00Z' },
      { ...base, id: 3, utcDate: '2026-11-12T23:15:00Z' }, // 00:15 on the 13th at UTC+1
    ]);
    expect(filterToLocalDate(list, '2026-11-12', 'Etc/GMT-1').map((f) => f.id)).toEqual(['fd:1', 'fd:2']);
    expect(filterToLocalDate(list, '2026-11-12', 'UTC').map((f) => f.id)).toEqual(['fd:2', 'fd:3']);
  });
});
