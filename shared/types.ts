// Normalized data model shared by the frontend and the Cloudflare functions.
// Every provider adapter converts its own format into these types.

export type MatchStatus =
  | 'scheduled'
  | 'live'
  | 'finished'
  | 'postponed'
  | 'suspended'
  | 'cancelled'
  | 'unknown';

export interface TeamRef {
  id: string; // provider-prefixed, e.g. "fd:57"
  name: string;
  shortName?: string;
  tla?: string;
  crestUrl?: string;
}

export interface CompetitionRef {
  id: string;
  name: string;
  code?: string;
  country?: string;
  emblemUrl?: string;
}

export interface ScorePair {
  home: number | null;
  away: number | null;
}

export interface Fixture {
  id: string;
  provider: ProviderId;
  kickoffUtc: string; // ISO 8601
  status: MatchStatus;
  rawStatus: string;
  competition: CompetitionRef;
  home: TeamRef;
  away: TeamRef;
  /** Only present when the provider actually returned a value. */
  fullTime?: ScorePair;
  halfTime?: ScorePair;
  matchday?: number;
  seasonStartYear?: number;
}

export type ProviderId = 'football-data.org';

/** Provenance attached to every significant dataset shown in the app. */
export interface SourceInfo {
  provider: ProviderId;
  endpoint: string; // record reference, without secrets
  retrievedAt: string; // ISO 8601
  coverage: string; // human-readable coverage window
  fromCache: boolean;
}

export type ApiErrorCode =
  | 'missing_api_key'
  | 'rate_limited'
  | 'provider_error'
  | 'bad_request'
  | 'timeout';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

export interface FixturesResponse {
  date: string; // YYYY-MM-DD in the requested timezone
  timeZone: string;
  fixtures: Fixture[];
  source: SourceInfo;
}
