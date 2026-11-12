// GET /api/odds?competition=PL
// Bookmaker odds for one league from The Odds API (licensed feed, free plan).
// Cached for 12 hours per league to stay inside 500 free credits per month.
import type { ApiError } from '../shared/types';
import type { Env } from './env';
import { ODDS_API_BASE, ODDS_SPORT_KEYS, type OddsResponse } from '../shared/providers/oddsApi';

const CACHE_SECONDS = 12 * 3600;
const TIMEOUT_MS = 10_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const error = (status: number, err: ApiError) => json({ error: err }, status);

export async function handleOdds(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const code = new URL(request.url).searchParams.get('competition') ?? '';
  const sport = Object.prototype.hasOwnProperty.call(ODDS_SPORT_KEYS, code) ? ODDS_SPORT_KEYS[code] : undefined;
  if (!sport) return error(400, { code: 'bad_request', message: 'No bookmaker odds feed is configured for this competition.' });
  if (!env.ODDS_API_KEY) {
    return error(503, { code: 'missing_api_key', message: 'No odds key is configured. Add ODDS_API_KEY in Cloudflare (see README, "Bookmaker odds").' });
  }

  const publicPath = `/sports/${sport}/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`;
  const endpoint = `GET ${ODDS_API_BASE}${publicPath}`;
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/odds-api${publicPath}`);
  const hit = await cache.match(cacheKey);
  if (hit) {
    const body = (await hit.json()) as OddsResponse;
    return json({ ...body, fromCache: true });
  }

  let res: Response;
  try {
    res = await fetch(`${ODDS_API_BASE}${publicPath}&apiKey=${encodeURIComponent(env.ODDS_API_KEY)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return error(504, { code: 'timeout', message: 'The odds provider did not respond in time.' });
  }
  const remainingHeader = res.headers.get('x-requests-remaining');
  const creditsRemaining = remainingHeader !== null && Number.isFinite(Number(remainingHeader)) ? Number(remainingHeader) : null;

  if (res.status === 429) return error(429, { code: 'rate_limited', message: 'The odds provider is rate limiting requests. Try again in a minute.', retryAfterSeconds: 60 });
  if (res.status === 401 || res.status === 403) {
    // The provider uses 401 both for a wrong key and for an exhausted monthly quota.
    const text = await res.text().catch(() => '');
    const out = /OUT_OF_USAGE_CREDITS|quota/i.test(text);
    return error(out ? 429 : 503, out
      ? { code: 'rate_limited', message: 'The 500 free odds credits for this month are used up. Odds return when the month resets.' }
      : { code: 'missing_api_key', message: 'The odds provider rejected the key. Check ODDS_API_KEY in Cloudflare.' });
  }
  if (!res.ok) return error(502, { code: 'provider_error', message: `The odds provider returned HTTP ${res.status}.` });

  const events = await res.json().catch(() => null);
  if (!Array.isArray(events)) return error(502, { code: 'provider_error', message: 'The odds provider returned an unexpected response.' });

  const body: OddsResponse = { events, retrievedAt: new Date().toISOString(), fromCache: false, creditsRemaining, endpoint };
  ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'cache-control': `max-age=${CACHE_SECONDS}` } })));
  return json(body);
}
