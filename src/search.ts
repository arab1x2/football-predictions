// Accent- and case-insensitive text matching for team search.
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function teamMatches(query: string, names: (string | undefined)[]): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  return names.some((n) => n && normalizeText(n).includes(q));
}
