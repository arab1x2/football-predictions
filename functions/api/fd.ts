// GET /api/fd?path=<allowed football-data.org v4 path>
// A narrow, cached, server-side gateway. Only whitelisted read-only paths are
// accepted, so this cannot be used as an open proxy, and the key stays here.
import type { ApiError } from '../../shared/types';
import { FOOTBALL_DATA_BASE } from '../../shared/providers/footballData';
import { checkFdPath } from '../../shared/providers/fdPaths';

interface Env {
  FOOTBALL_DATA_API_KEY?: string;
}

const TIMEOUT_MS = 10_000;

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}
const error = (status: number, err: ApiError) =>
  json({ error: err }, status, err.retryAfterSeconds ? { 'retry-after': String(err.retryAfterSeconds) } : {});

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const path = new URL(request.url).searchParams.get('path') ?? '';
  const check = checkFdPath(path);
  if (!check.ok) return error(400, { code: 'bad_request', message: check.reason });
  if (!env.FOOTBALL_DATA_API_KEY) {
    return error(503, { code: 'missing_api_key', message: 'The server has no football-data.org API key configured.' });
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/football-data${path}`);
  const hit = await cache.match(cacheKey);
  if (hit) {
    return json(
      { data: await hit.json(), retrievedAt: hit.headers.get('x-retrieved-at'), fromCache: true, endpoint: `GET ${FOOTBALL_DATA_BASE}${path}` },
    );
  }

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(FOOTBALL_DATA_BASE + path, {
        headers: { 'X-Auth-Token': env.FOOTBALL_DATA_API_KEY },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      res = null;
    }
    if (res && res.status < 500) break;
  }
  if (!res) return error(504, { code: 'timeout', message: 'football-data.org did not respond in time.' });
  if (res.status === 429) {
    const retry = Number(res.headers.get('x-requestcounter-reset') ?? 60);
    return error(429, { code: 'rate_limited', message: 'Free data plan limit reached (10 requests/minute). Try again shortly.', retryAfterSeconds: Number.isFinite(retry) ? retry : 60 });
  }
  if (res.status === 403) {
    return error(403, { code: 'provider_error', message: 'This competition or season is not included in the free football-data.org plan.' });
  }
  if (res.status === 404) return error(404, { code: 'provider_error', message: 'Not found at football-data.org.' });
  if (!res.ok) return error(502, { code: 'provider_error', message: `football-data.org returned HTTP ${res.status}.` });

  const data = await res.json();
  const retrievedAt = new Date().toISOString();
  waitUntil(
    cache.put(cacheKey, new Response(JSON.stringify(data), {
      headers: { 'cache-control': `max-age=${check.ttlSeconds}`, 'x-retrieved-at': retrievedAt },
    })),
  );
  return json({ data, retrievedAt, fromCache: false, endpoint: `GET ${FOOTBALL_DATA_BASE}${path}` });
};
