import type { ApiError, SourceInfo } from '../../shared/types';

export type FdResult<T> = { ok: true; data: T; source: SourceInfo } | { ok: false; error: ApiError };

export async function fdGet<T>(path: string, coverage: string): Promise<FdResult<T>> {
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
