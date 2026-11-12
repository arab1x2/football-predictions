import type { ApiError, FixturesResponse } from '../shared/types';

export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function fetchFixtures(date: string, tz: string): Promise<FetchResult<FixturesResponse>> {
  try {
    const res = await fetch(`/api/fixtures?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(tz)}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: body?.error ?? { code: 'provider_error', message: `Server returned HTTP ${res.status}.` },
      };
    }
    return { ok: true, data: body as FixturesResponse };
  } catch {
    return { ok: false, error: { code: 'provider_error', message: 'Could not reach the app server.' } };
  }
}
