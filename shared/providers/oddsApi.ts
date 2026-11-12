// Adapter for The Odds API v4 (https://the-odds-api.com), a licensed odds
// feed with a free plan (500 credits per month). One call for a league with
// two markets in one region costs 2 credits.
export const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

/** football-data.org competition code -> The Odds API sport key. */
export const ODDS_SPORT_KEYS: Record<string, string> = {
  PL: 'soccer_epl',
  ELC: 'soccer_efl_champ',
  PD: 'soccer_spain_la_liga',
  BL1: 'soccer_germany_bundesliga',
  SA: 'soccer_italy_serie_a',
  FL1: 'soccer_france_ligue_one',
  DED: 'soccer_netherlands_eredivisie',
  PPL: 'soccer_portugal_primeira_liga',
  BSA: 'soccer_brazil_campeonato',
  CL: 'soccer_uefa_champs_league',
  WC: 'soccer_fifa_world_cup',
  EC: 'soccer_uefa_european_championship',
};

// Raw shapes (only what we use; all optional so bad records can't crash us).
export interface RawOddsOutcome { name?: string; price?: number; point?: number }
export interface RawOddsMarket { key?: string; outcomes?: RawOddsOutcome[] }
export interface RawOddsBookmaker { key?: string; title?: string; markets?: RawOddsMarket[] }
export interface RawOddsEvent {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: RawOddsBookmaker[];
}

export interface OddsResponse {
  events: RawOddsEvent[];
  retrievedAt: string;
  fromCache: boolean;
  /** Credits left this month, as reported by the provider at retrieval time. */
  creditsRemaining: number | null;
  endpoint: string;
}

// ---- Matching a fixture to an odds event -------------------------------

const GENERIC = new Set([
  'fc', 'cf', 'afc', 'sc', 'ac', 'bc', 'as', 'ss', 'us', 'cd', 'ud', 'rc', 'rcd', 'sv', 'vfb', 'vfl', 'tsg', 'fsv',
  'club', 'clube', 'de', 'del', 'la', 'calcio', 'cp', 'sl', 'ca', 'ec', 'se', 'cr', 'the', 'and', '1', '04', '05', '1899', '1846', '1910',
]);

export function teamTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !GENERIC.has(t));
}

function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 4 && l.startsWith(s); // "inter" ~ "internazionale", "milan" ~ "milano"
}

/** 0..1 similarity between two team names (Dice coefficient on tokens). */
export function teamSimilarity(a: string, b: string): number {
  const ta = teamTokens(a), tb = teamTokens(b);
  if (!ta.length || !tb.length) return 0;
  const used = new Set<number>();
  let hits = 0;
  for (const x of ta) {
    const j = tb.findIndex((y, i) => !used.has(i) && tokenMatch(x, y));
    if (j >= 0) { used.add(j); hits++; }
  }
  return (2 * hits) / (ta.length + tb.length);
}

export interface FixtureKey { kickoffUtc: string; homeNames: (string | undefined)[]; awayNames: (string | undefined)[] }

const MIN_SCORE = 0.6;
const MIN_MARGIN = 0.15;
const MAX_KICKOFF_GAP_MS = 24 * 3600_000;

/**
 * Finds the odds event for a fixture. Both teams must match and the best
 * candidate must be clearly ahead of the next one; otherwise returns null
 * rather than risk showing odds for the wrong match.
 */
export function matchOddsEvent(f: FixtureKey, events: RawOddsEvent[]): RawOddsEvent | null {
  const best = (names: (string | undefined)[], other: string) => Math.max(0, ...names.filter(Boolean).map((n) => teamSimilarity(n!, other)));
  const kickoff = Date.parse(f.kickoffUtc);
  const scored = events
    .filter((e) => e.commence_time && e.home_team && e.away_team && Math.abs(Date.parse(e.commence_time) - kickoff) <= MAX_KICKOFF_GAP_MS)
    .map((e) => ({ e, score: Math.min(best(f.homeNames, e.home_team!), best(f.awayNames, e.away_team!)) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.score < MIN_SCORE) return null;
  if (scored[1] && top.score - scored[1].score < MIN_MARGIN) return null;
  return top.e;
}

// ---- Comparing bookmaker prices with model probabilities ----------------

export interface PriceSummary {
  /** Highest price on offer and who offers it. */
  best: number;
  bestBookmaker: string;
  /** Average of the bookmakers' implied chances after removing their margin. */
  marketChance: number;
  bookmakers: number;
}

/**
 * Summarizes one market (e.g. "h2h", or "totals" at a given point) across
 * bookmakers. `outcomeNames` are the provider's outcome names in a fixed
 * order; a bookmaker is used only if it prices every one of them.
 */
export function summarizeMarket(event: RawOddsEvent, marketKey: string, outcomeNames: string[], point?: number): PriceSummary[] | null {
  const best = outcomeNames.map(() => ({ price: 0, book: '' }));
  const chanceSum = outcomeNames.map(() => 0);
  let n = 0;
  for (const b of event.bookmakers ?? []) {
    const m = (b.markets ?? []).find((x) => x.key === marketKey);
    if (!m) continue;
    const prices = outcomeNames.map((name) => {
      const o = (m.outcomes ?? []).find((x) => x.name === name && (point === undefined || x.point === point));
      return o && typeof o.price === 'number' && o.price > 1 ? o.price : null;
    });
    if (prices.some((p) => p === null)) continue;
    const inv = prices.map((p) => 1 / p!);
    const total = inv.reduce((a, c) => a + c, 0);
    inv.forEach((v, i) => { chanceSum[i] = chanceSum[i]! + v / total; });
    prices.forEach((p, i) => { if (p! > best[i]!.price) best[i] = { price: p!, book: b.title ?? b.key ?? 'unknown' }; });
    n++;
  }
  if (!n) return null;
  return outcomeNames.map((_, i) => ({ best: best[i]!.price, bestBookmaker: best[i]!.book, marketChance: chanceSum[i]! / n, bookmakers: n }));
}

/** Goal lines (e.g. 2.5) that at least one bookmaker prices in the totals market. */
export function totalsPoints(event: RawOddsEvent): number[] {
  const set = new Set<number>();
  for (const b of event.bookmakers ?? []) for (const m of b.markets ?? []) {
    if (m.key !== 'totals') continue;
    for (const o of m.outcomes ?? []) if (typeof o.point === 'number') set.add(o.point);
  }
  return [...set].sort((a, b) => a - b);
}

/** Expected profit per 1 unit staked if the model's chance were exactly right. */
export function edge(modelChance: number, price: number): number {
  return modelChance * price - 1;
}
