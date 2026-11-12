// Picks for every upcoming match of a day. Only league results are needed,
// so each competition costs 2 requests (current + previous season), shared
// by all its matches. The same model and rules as Deep Analyze are used.
import type { Fixture } from '../../shared/types';
import { normalizeMatches, type FdMatch } from '../../shared/providers/footballData';
import { fitPoisson, toTraining, expectedGoals, scoreMatrix } from '../../shared/model/poisson';
import { marketsFromMatrix } from '../../shared/model/markets';
import { buildPicks, type Pick } from '../../shared/model/picks';
import { fdGet } from './fd';
import { modelBlocker, seasonYearOf } from './run';

export interface DayPick {
  fixture: Fixture;
  result?: Pick;
  doubleChance?: Pick;
  picks?: Pick[];
  best?: Pick;
  reason?: string;
}

export async function computeDayPicks(
  fixtures: Fixture[],
  onProgress: (msg: string, done: number, total: number) => void,
): Promise<DayPick[]> {
  const upcoming = fixtures.filter((f) => f.status === 'scheduled');
  const byComp = new Map<string, Fixture[]>();
  for (const f of upcoming) {
    const key = `${f.competition.code ?? ''}|${seasonYearOf(f)}`;
    byComp.set(key, [...(byComp.get(key) ?? []), f]);
  }
  const out: DayPick[] = [];
  let done = 0;
  const total = byComp.size;
  for (const [key, list] of byComp) {
    const [code, yearStr] = key.split('|') as [string, string];
    const year = Number(yearStr);
    const name = list[0]!.competition.name;
    onProgress(`Loading ${name}…`, done, total);
    if (!code) {
      for (const f of list) out.push({ fixture: f, reason: 'Competition code missing.' });
      done++;
      continue;
    }
    const wait = (s: number) => onProgress(`Free data limit reached, waiting ${s}s…`, done, total);
    const cur = await fdGet<{ matches?: FdMatch[] }>(`/competitions/${code}/matches?season=${year}&status=FINISHED`, '', wait);
    const prev = await fdGet<{ matches?: FdMatch[] }>(`/competitions/${code}/matches?season=${year - 1}&status=FINISHED`, '', wait);
    const all = [...(cur.ok ? normalizeMatches(cur.data.matches ?? []) : []), ...(prev.ok ? normalizeMatches(prev.data.matches ?? []) : [])];
    const league = [...new Map(all.map((f) => [f.id, f])).values()];
    // One fit per competition, using only matches before the day's first kickoff.
    const asOf = list.map((f) => f.kickoffUtc).sort()[0]!;
    const rows = toTraining(league, asOf);
    const fit = rows.length ? fitPoisson(rows, asOf) : null;
    for (const f of list) {
      const hs = rows.filter((r) => r.home === f.home.id || r.away === f.home.id).length;
      const as = rows.filter((r) => r.home === f.away.id || r.away === f.away.id).length;
      const reason = !cur.ok && !prev.ok ? cur.error.message : modelBlocker(f, rows.length, hs, as);
      if (reason || !fit) { out.push({ fixture: f, reason: reason || 'No league data.' }); continue; }
      const xg = expectedGoals(fit, f.home.id, f.away.id);
      const p = buildPicks(marketsFromMatrix(scoreMatrix(xg.home, xg.away), f.home.shortName ?? f.home.name, f.away.shortName ?? f.away.name));
      const best = [p.result, p.doubleChance, ...p.picks].sort((x, y) => y.p - x.p)[0];
      out.push({ fixture: f, ...p, best });
    }
    done++;
    onProgress(`${name} done`, done, total);
  }
  return out.sort((a, b) => a.fixture.kickoffUtc.localeCompare(b.fixture.kickoffUtc));
}
