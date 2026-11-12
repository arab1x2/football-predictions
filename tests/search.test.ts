import { describe, expect, it } from 'vitest';
import { teamMatches } from '../src/search';

describe('team search', () => {
  it('ignores accents and case', () => {
    expect(teamMatches('atletico', ['Club Atlético de Madrid'])).toBe(true);
    expect(teamMatches('MÜNCHEN', ['FC Bayern München'])).toBe(true);
  });
  it('matches abbreviations', () => {
    expect(teamMatches('psg', ['Paris Saint-Germain FC', 'PSG', 'PSG'])).toBe(true);
  });
  it('does not match unrelated teams', () => {
    expect(teamMatches('real', ['FC Barcelona', 'Barça', 'FCB'])).toBe(false);
  });
});
