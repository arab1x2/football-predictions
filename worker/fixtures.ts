// GET /api/fixtures?date=YYYY-MM-DD&tz=Africa/Casablanca
// Server-side only: the API key never reaches the browser.
import type { ApiError, FixturesResponse } from '../shared/types';
import { DEFAULT_TIME_ZONE, isValidDateString, isValidTimeZone, todayIn } from '../shared/time';
import { FOOTBALL_DATA_BASE, normalizeMatches, type FdMatch } from '../shared/providers/footballData';
import { filterToLocalDate, utcQueryWindow } from '../shared/fixturesForDate';

import type { Env } from './env';

const CACHE_SECONDS = 120; // keeps us well under the free 10 requests/minute
const TIMEOUT_MS = 10_000;

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function error(status: number, err: ApiError): Response {
  const headers: Record<string, string> = {};
  if (err.retryAfterSeconds) headers['retry-after'] = String(err.retryAfterSeconds);
  return json({ error: err }, status, headers);
}

export async function handleFixtures(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const waitUntil = (p: Promise<unknown>) => ctx.waitUntil(p);
  const url = new URL(request.url);
  const tz = url.searchParams.get('tz') ?? DEFAULT_TIME_ZONE;
  if (!isValidTimeZone(tz)) return error(400, { code: 'bad_request', message: `Unknown time zone: ${tz}` });
  const date = url.searchParams.get('date') ?? todayIn(tz);
  if (!isValidDateString(date)) return error(400, { code: 'bad_request', message: 'date must be YYYY-MM-DD' });

  if (!env.FOOTBALL_DATA_API_KEY) {
    return error(503, {
      code: 'missing_api_key',
      message: 'The server has no football-data.org API key configured. See README, section "Add your API key".',
    });
  }

  const { dateFrom, dateTo } = utcQueryWindow(date);
  const endpoint = `/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;

  // Cache the raw provider response per UTC window, shared by all visitors.
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/football-data${endpoint}`);
  let raw: { matches?: FdMatch[] } | null = null;
  let retrievedAt = new Date().toISOString();
  let fromCache = false;

  const cached = await cache.match(cacheKey);
  if (cached) {
    raw = await cached.json();
    retrievedAt = cached.headers.get('x-retrieved-at') ?? retrievedAt;
    fromCache = true;
  } else {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetch(FOOTBALL_DATA_BASE + endpoint, {
          headers: { 'X-Auth-Token': env.FOOTBALL_DATA_API_KEY },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        res = null;
      }
      // Retry once only on network failure or 5xx. Never retry a 429.
      if (res && res.status < 500) break;
    }

    if (!res) return error(504, { code: 'timeout', message: 'football-data.org did not respond in time.' });
    if (res.status === 429) {
      const retry = Number(res.headers.get('x-requestcounter-reset') ?? res.headers.get('retry-after') ?? 60);
      return error(429, {
        code: 'rate_limited',
        message: 'The free data plan limit was reached. Please try again in a minute.',
        retryAfterSeconds: Number.isFinite(retry) ? retry : 60,
      });
    }
    if (!res.ok) {
      return error(502, { code: 'provider_error', message: `football-data.org returned HTTP ${res.status}.` });
    }
    raw = await res.json();
    retrievedAt = new Date().toISOString();
    waitUntil(
      cache.put(
        cacheKey,
        new Response(JSON.stringify(raw), {
          headers: { 'cache-control': `max-age=${CACHE_SECONDS}`, 'x-retrieved-at': retrievedAt },
        }),
      ),
    );
  }

  const fixtures = filterToLocalDate(normalizeMatches(raw?.matches ?? []), date, tz);
  const body: FixturesResponse = {
    date,
    timeZone: tz,
    fixtures,
    source: {
      provider: 'football-data.org',
      endpoint: `GET ${FOOTBALL_DATA_BASE}${endpoint}`,
      retrievedAt,
      coverage: 'Free plan competitions only (12): Champions League, Premier League, Championship, La Liga, Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Brasileirão Série A, World Cup, European Championship.',
      fromCache,
    },
  };
  return json(body, 200, { 'cache-control': 'public, max-age=60' });
}
