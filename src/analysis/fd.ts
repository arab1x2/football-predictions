import type { ApiError, SourceInfo } from '../../shared/types';

export type FdResult<T> = { ok: true; data: T; source: SourceInfo } | { ok: false; error: ApiError };

const memo = new Map<string, { at: number; result: FdResult<unknown> }>();
const MEMO_MS = 10 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cached in the browser for 10 minutes, and waits once for the free plan's
 * per-minute limit to reset if it is hit.
 */
export async function fdGet<T>(path: string, coverage: string, onWait?: (seconds: number) => void): Promise<FdResult<T>> {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.result as FdResult<T>;
  let r = await fdGetOnce<T>(path, coverage);
  if (!r.ok && r.error.code === 'rate_limited') {
    const wait = Math.min(65, Math.max(5, r.error.retryAfterSeconds ?? 60));
    onWait?.(wait);
    await sleep(wait * 1000);
    r = await fdGetOnce<T>(path, coverage);
  }
  if (r.ok) memo.set(path, { at: Date.now(), result: r });
  return r;
}

async function fdGetOnce<T>(path: string, coverage: string): Promise<FdResult<T>> {
  try {
    const res = await fetch(`/api/fd?path=${encodeURIComponent(path)}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      return { ok: false, error: body?.error ?? { code: 'provider_error', message: `Server returned HTTP ${res.status}.` } };
    }
    return {
      ok: true,
      data: body.data as T,
      source: { provider: 'football-data.org', endpoint: body.endpoint, retrievedAt: body.retrievedAt, coverage, fromCache: body.fromCache },
    };
  } catch {
    return { ok: false, error: { code: 'provider_error', message: 'Could not reach the app server.' } };
  }
}
