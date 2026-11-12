// Pure logic for "fixtures on a local date", kept separate from the network
// code so it can be unit tested.
import type { Fixture } from './types';
import { addDays, localDateOf } from './time';

/**
 * A local calendar day can span two UTC days (e.g. Casablanca is UTC+1),
 * so we ask the provider for the day before through the day after, then keep
 * only matches whose kickoff falls on the requested local date.
 */
export function utcQueryWindow(localDate: string): { dateFrom: string; dateTo: string } {
  return { dateFrom: addDays(localDate, -1), dateTo: addDays(localDate, 1) };
}

export function filterToLocalDate(fixtures: Fixture[], localDate: string, timeZone: string): Fixture[] {
  return fixtures.filter((f) => localDateOf(f.kickoffUtc, timeZone) === localDate);
}
