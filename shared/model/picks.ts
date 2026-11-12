// Turns market probabilities into a short list of picks: for each key market,
// the more likely side and its probability. No probability is ever rounded up
// to certainty; strength labels are fixed thresholds on the model probability.
import type { MarketLine } from './markets';

export type Strength = 'strong' | 'good' | 'lean' | 'coin-flip';
export interface Pick { market: string; pick: string; p: number; strength: Strength }

export function strengthOf(p: number): Strength {
  if (p >= 0.75) return 'strong';
  if (p >= 0.62) return 'good';
  if (p >= 0.54) return 'lean';
  return 'coin-flip';
}

const KEY_MARKETS: { market: string; title: string }[] = [
  { market: 'Total goals 1.5', title: 'Goals 1.5' },
  { market: 'Total goals 2.5', title: 'Goals 2.5' },
  { market: 'Total goals 3.5', title: 'Goals 3.5' },
  { market: 'Both teams to score', title: 'Both teams score' },
];

export function buildPicks(markets: MarketLine[]): { result: Pick; doubleChance: Pick; picks: Pick[] } {
  const find = (name: string) => markets.find((m) => m.market === name);
  const r = find('Full time result')!.outcomes;
  const [h, d, a] = [r[0]!, r[1]!, r[2]!];
  const best = [h, d, a].sort((x, y) => y.p - x.p)[0]!;
  const result: Pick = { market: '1X2', pick: best.label, p: best.p, strength: strengthOf(best.p) };
  const dc = h.p >= a.p
    ? { pick: `${h.label.replace(' win', '')} or draw (1X)`, p: h.p + d.p }
    : { pick: `${a.label.replace(' win', '')} or draw (X2)`, p: a.p + d.p };
  const doubleChance: Pick = { market: 'Double chance', ...dc, strength: strengthOf(dc.p) };
  const picks: Pick[] = [];
  for (const k of KEY_MARKETS) {
    const m = find(k.market);
    if (!m) continue;
    const top = [...m.outcomes].sort((x, y) => y.p - x.p)[0]!;
    picks.push({ market: k.title, pick: top.label, p: top.p, strength: strengthOf(top.p) });
  }
  for (const m of markets.filter((x) => x.market.endsWith(' to score') && x.market !== 'Both teams to score')) {
    const top = [...m.outcomes].sort((x, y) => y.p - x.p)[0]!;
    picks.push({ market: m.market, pick: top.label.startsWith('Yes') ? 'Yes' : 'No', p: top.p, strength: strengthOf(top.p) });
  }
  return { result, doubleChance, picks: picks.sort((x, y) => y.p - x.p) };
}
