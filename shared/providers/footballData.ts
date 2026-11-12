// Adapter for football-data.org API v4 (https://docs.football-data.org).
// Free plan: registered key, 10 requests/minute, 12 competitions.
import type { Fixture, MatchStatus, ScorePair } from '../types';

export const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

/** Competitions available on the football-data.org free plan. */
export const FREE_COMPETITIONS = [
  'CL', 'PL', 'PD', 'BL1', 'SA', 'FL1', 'DED', 'PPL', 'ELC', 'BSA', 'WC', 'EC',
] as const;

// Raw shapes (only the fields we use). Everything is optional because we
// must not crash on missing fields.
interface FdTeam { id?: number; name?: string; shortName?: string; tla?: string; crest?: string }
interface FdScorePair { home?: number | null; away?: number | null }
export interface FdMatch {
  id?: number;
  utcDate?: string;
  status?: string;
  matchday?: number | null;
  season?: { startDate?: string };
  competition?: { id?: number; name?: string; code?: string; emblem?: string };
  area?: { name?: string };
  homeTeam?: FdTeam;
  awayTeam?: FdTeam;
  score?: { fullTime?: FdScorePair; halfTime?: FdScorePair };
}

export function mapStatus(raw: string | undefined): MatchStatus {
  switch (raw) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'scheduled';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'LIVE':
      return 'live';
    case 'FINISHED':
    case 'AWARDED':
      return 'finished';
    case 'POSTPONED':
      return 'postponed';
    case 'SUSPENDED':
      return 'suspended';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function score(pair: FdScorePair | undefined): ScorePair | undefined {
  if (!pair) return undefined;
  const home = typeof pair.home === 'number' ? pair.home : null;
  const away = typeof pair.away === 'number' ? pair.away : null;
  // Do not report a score the provider didn't give us.
  if (home === null && away === null) return undefined;
  return { home, away };
}

function team(t: FdTeam | undefined) {
  return {
    id: t?.id != null ? `fd:${t.id}` : 'fd:unknown',
    name: t?.name ?? 'Unknown team',
    shortName: t?.shortName,
    tla: t?.tla,
    crestUrl: t?.crest,
  };
}

/** Converts one raw match. Returns null when essential fields are missing. */
export function normalizeMatch(m: FdMatch): Fixture | null {
  if (m.id == null || !m.utcDate || Number.isNaN(Date.parse(m.utcDate))) return null;
  const status = mapStatus(m.status);
  const fixture: Fixture = {
    id: `fd:${m.id}`,
    provider: 'football-data.org',
    kickoffUtc: new Date(m.utcDate).toISOString(),
    status,
    rawStatus: m.status ?? 'UNKNOWN',
    competition: {
      id: m.competition?.id != null ? `fd:${m.competition.id}` : 'fd:unknown',
      name: m.competition?.name ?? 'Unknown competition',
      code: m.competition?.code,
      country: m.area?.name,
      emblemUrl: m.competition?.emblem,
    },
    home: team(m.homeTeam),
    away: team(m.awayTeam),
    matchday: m.matchday ?? undefined,
    seasonStartYear: m.season?.startDate ? Number(m.season.startDate.slice(0, 4)) : undefined,
  };
  // Scores only make sense once a match has started.
  if (status === 'live' || status === 'finished') {
    const ft = score(m.score?.fullTime);
    const ht = score(m.score?.halfTime);
    if (ft) fixture.fullTime = ft;
    if (ht) fixture.halfTime = ht;
  }
  return fixture;
}

/** Normalizes, removes duplicates, and sorts by kickoff. */
export function normalizeMatches(raw: FdMatch[]): Fixture[] {
  const byId = new Map<string, Fixture>();
  for (const m of raw) {
    const f = normalizeMatch(m);
    if (f) byId.set(f.id, f);
  }
  return [...byId.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}
