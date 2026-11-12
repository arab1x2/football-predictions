// Whitelist of football-data.org v4 paths the app may request, with cache times.
const RULES: { re: RegExp; ttlSeconds: number }[] = [
  { re: /^\/matches\/\d{1,10}$/, ttlSeconds: 120 },
  { re: /^\/matches\/\d{1,10}\/head2head\?limit=\d{1,3}$/, ttlSeconds: 6 * 3600 },
  { re: /^\/teams\/\d{1,10}\/matches\?status=FINISHED&limit=\d{1,3}$/, ttlSeconds: 3 * 3600 },
  { re: /^\/competitions\/[A-Z0-9]{2,4}\/matches\?season=\d{4}&status=FINISHED$/, ttlSeconds: 3 * 3600 },
];

export type PathCheck = { ok: true; ttlSeconds: number } | { ok: false; reason: string };

export function checkFdPath(path: string): PathCheck {
  for (const r of RULES) if (r.re.test(path)) return { ok: true, ttlSeconds: r.ttlSeconds };
  return { ok: false, reason: 'This data path is not allowed.' };
}
