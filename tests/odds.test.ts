import { describe, expect, it } from 'vitest';
import { edge, matchOddsEvent, summarizeMarket, teamSimilarity, totalsPoints, type RawOddsEvent } from '../shared/providers/oddsApi';

const ev = (home: string, away: string, time = '2026-11-22T18:45:00Z', extra: Partial<RawOddsEvent> = {}): RawOddsEvent => ({
  id: home + away, commence_time: time, home_team: home, away_team: away, bookmakers: [], ...extra,
});

describe('team name matching across providers', () => {
  it('recognizes common naming differences', () => {
    expect(teamSimilarity('FC Internazionale Milano', 'Inter Milan')).toBe(1);
    expect(teamSimilarity('Atalanta BC', 'Atalanta')).toBe(1);
    expect(teamSimilarity('Club Atlético de Madrid', 'Atletico Madrid')).toBe(1);
    expect(teamSimilarity('Paris Saint-Germain FC', 'Paris Saint Germain')).toBe(1);
    expect(teamSimilarity('Arsenal FC', 'Chelsea')).toBe(0);
  });

  const fixture = { kickoffUtc: '2026-11-22T18:45:00Z', homeNames: ['Manchester United FC', 'Man United'], awayNames: ['Newcastle United FC', 'Newcastle'] };

  it('picks the right event when names overlap', () => {
    const events = [ev('Manchester City', 'West Ham United'), ev('Manchester United', 'Newcastle United'), ev('Arsenal', 'Chelsea')];
    expect(matchOddsEvent(fixture, events)?.home_team).toBe('Manchester United');
  });
  it('returns nothing when the match is not in the list', () => {
    expect(matchOddsEvent(fixture, [ev('Manchester City', 'West Ham United'), ev('Arsenal', 'Chelsea')])).toBeNull();
  });
  it('returns nothing when home and away are swapped or the date is far off', () => {
    expect(matchOddsEvent(fixture, [ev('Newcastle United', 'Manchester United')])).toBeNull();
    expect(matchOddsEvent(fixture, [ev('Manchester United', 'Newcastle United', '2026-12-20T18:45:00Z')])).toBeNull();
  });
  it('returns nothing when two candidates are equally good', () => {
    const twice = [ev('Manchester United', 'Newcastle United'), ev('Manchester United', 'Newcastle United', '2026-11-22T20:00:00Z')];
    expect(matchOddsEvent(fixture, twice)).toBeNull();
  });
});

describe('price summaries', () => {
  const event = ev('Home', 'Away', undefined, {
    bookmakers: [
      { title: 'BookA', markets: [
        { key: 'h2h', outcomes: [{ name: 'Home', price: 2.0 }, { name: 'Draw', price: 3.5 }, { name: 'Away', price: 4.0 }] },
        { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 2.5 }, { name: 'Under', price: 1.9, point: 2.5 }] },
      ] },
      { title: 'BookB', markets: [
        { key: 'h2h', outcomes: [{ name: 'Home', price: 2.1 }, { name: 'Draw', price: 3.4 }, { name: 'Away', price: 3.8 }] },
      ] },
      { title: 'Broken', markets: [{ key: 'h2h', outcomes: [{ name: 'Home', price: 9 }] }] }, // incomplete: ignored
    ],
  });

  it('finds the best price and a margin-free market chance', () => {
    const s = summarizeMarket(event, 'h2h', ['Home', 'Draw', 'Away'])!;
    expect(s[0]!.best).toBe(2.1);
    expect(s[0]!.bestBookmaker).toBe('BookB');
    expect(s[2]!.best).toBe(4.0);
    expect(s[0]!.bookmakers).toBe(2);
    expect(s.reduce((t, x) => t + x.marketChance, 0)).toBeCloseTo(1, 9);
  });
  it('handles totals by goal line and missing markets', () => {
    expect(totalsPoints(event)).toEqual([2.5]);
    expect(summarizeMarket(event, 'totals', ['Over', 'Under'], 2.5)![0]!.marketChance).toBeCloseTo(0.5, 9);
    expect(summarizeMarket(event, 'totals', ['Over', 'Under'], 3.5)).toBeNull();
  });
  it('computes value only from the model chance and the price', () => {
    expect(edge(0.5, 2.2)).toBeCloseTo(0.1, 9);
    expect(edge(0.5, 1.8)).toBeLessThan(0);
  });
});

describe('short names help where full names differ', () => {
  it('matches Bayern and Sporting through their short names', () => {
    const f = { kickoffUtc: '2026-11-22T18:45:00Z', homeNames: ['FC Bayern München', 'Bayern'], awayNames: ['Sporting Clube de Portugal', 'Sporting CP'] };
    expect(matchOddsEvent(f, [ev('Bayern Munich', 'Sporting Lisbon'), ev('Bayer Leverkusen', 'Benfica')])?.home_team).toBe('Bayern Munich');
  });
});
