import { describe, expect, it } from 'vitest';
import { addDays, formatKickoff, isValidDateString, isValidTimeZone, localDateOf, todayIn } from '../shared/time';

describe('time helpers', () => {
  it('validates dates strictly', () => {
    expect(isValidDateString('2026-11-12')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('12/11/2026')).toBe(false);
  });
  it('validates time zones', () => {
    expect(isValidTimeZone('Africa/Casablanca')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  // Fixed-offset zones keep these tests stable when real-world rules change.
  // (Morocco's offset depends on official decisions; the app relies on the
  // runtime's up-to-date time zone database rather than a hardcoded offset.)
  it('computes the local date near midnight', () => {
    expect(localDateOf('2026-11-12T23:30:00Z', 'Etc/GMT-1')).toBe('2026-11-13'); // UTC+1
    expect(localDateOf('2026-11-12T22:30:00Z', 'Etc/GMT-1')).toBe('2026-11-12');
    expect(localDateOf('2026-11-12T08:00:00Z', 'Asia/Tokyo')).toBe('2026-11-12');
    expect(localDateOf('2026-11-12T16:00:00Z', 'Asia/Tokyo')).toBe('2026-11-13');
    expect(todayIn('UTC', new Date('2026-11-12T23:30:00Z'))).toBe('2026-11-12');
  });
  it('formats kickoff in the chosen zone', () => {
    expect(formatKickoff('2026-11-12T20:00:00Z', 'Etc/GMT-1')).toBe('21:00');
    expect(formatKickoff('2026-11-12T20:00:00Z', 'Asia/Tokyo')).toBe('05:00');
    expect(formatKickoff('2026-11-12T20:00:00Z', 'UTC')).toBe('20:00');
  });
});
