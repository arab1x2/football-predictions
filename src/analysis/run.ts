// Runs the Deep Analyze pipeline. Each stage reports its real status as it runs.
import type { ApiError, Fixture, SourceInfo } from '../../shared/types';
import { normalizeMatch, normalizeMatches, type FdMatch } from '../../shared/providers/footballData';
import { fdGet } from './fd';
import { teamHistory, type TeamMatchView } from '../../shared/stats';
import { fitPoisson, toTraining, expectedGoals, scoreMatrix, type PoissonFit } from '../../shared/model/poisson';
import { marketsFromMatrix, topScorelines, type MarketLine } from '../../shared/model/markets';
import { backtest, bootstrap1x2, type BacktestResult } from '../../shared/model/backtest';

export type StageId = 'fixture' | 'homeHistory' | 'awayHistory' | 'h2h' | 'league' | 'model' | 'report';
export type StageStatus = 'pending' | 'running' | 'done' | 'partial' | 'failed' | 'skipped';
export interface Stage { id: StageId; label: string; status: StageStatus; detail?: string }

export const STAGES: Stage[] = [
  { id: 'fixture', label: 'Find the match', status: 'pending' },
  { id: 'homeHistory', label: 'Home team: past matches', status: 'pending' },
  { id: 'awayHistory', label: 'Away team: past matches', status: 'pending' },
  { id: 'h2h', label: 'Head-to-head meetings', status: 'pending' },
  { id: 'league', label: 'League results for the model', status: 'pending' },
  { id: 'model', label: 'Goals model and checks', status: 'pending' },
  { id: 'report', label: 'Write the report', status: 'pending' },
];

export const MIN_LEAGUE_MATCHES = 40;
export const MIN_TEAM_MATCHES = 6;

/** Why the model must not be used for this match, or undefined if it can. */
export function modelBlocker(fixture: Fixture, leagueRows: number, homeSample: number, awaySample: number): string | undefined {
  if (fixture.status !== 'scheduled') return `This match is ${fixture.status}. Pre-match predictions are only produced for upcoming matches, so a known result never feeds the model.`;
  if (leagueRows < MIN_LEAGUE_MATCHES) return `Not enough league results to fit the model (${leagueRows}; at least ${MIN_LEAGUE_MATCHES} needed).`;
  if (homeSample < MIN_TEAM_MATCHES || awaySample < MIN_TEAM_MATCHES) return `Not enough matches in this competition for both teams (${fixture.home.name}: ${homeSample}, ${fixture.away.name}: ${awaySample}; at least ${MIN_TEAM_MATCHES} each needed).`;
  return undefined;
}

export function seasonYearOf(fixture: Fixture): number {
  if (fixture.seasonStartYear) return fixture.seasonStartYear;
  const d = new Date(fixture.kickoffUtc);
  return d.getUTCMonth() < 6 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
}

export interface ModelOutput {
  fit: PoissonFit;
  xg: { home: number; away: number };
  markets: MarketLine[];
  scorelines: { home: number; away: number; p: number }[];
  range1x2: { low: number; high: number }[];
  backtest: BacktestResult | null;
  homeSample: number;
  awaySample: number;
}

export interface Analysis {
  fixture: Fixture;
  homeHistory: TeamMatchView[];
  awayHistory: TeamMatchView[];
  h2h: Fixture[];
  model: ModelOutput | null;
  modelUnavailableReason?: string;
  sources: { label: string; source: SourceInfo }[];
  failures: { label: string; error: ApiError }[];
}

type Update = (id: StageId, status: StageStatus, detail?: string) => void;

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

export async function runAnalysis(matchId: string, update: Update): Promise<{ ok: true; analysis: Analysis } | { ok: false; error: ApiError }> {
  const numericId = matchId.replace(/^fd:/, '');
  if (!/^\d+$/.test(numericId)) return { ok: false, error: { code: 'bad_request', message: 'Unknown match id.' } };
  const sources: Analysis['sources'] = [];
  const failures: Analysis['failures'] = [];

  update('fixture', 'running');
  const m = await fdGet<FdMatch>(`/matches/${numericId}`, 'Single match record');
  if (!m.ok) { update('fixture', 'failed', m.error.message); return { ok: false, error: m.error }; }
  const fixture = normalizeMatch(m.data);
  if (!fixture) { update('fixture', 'failed', 'The provider returned an incomplete match record.'); return { ok: false, error: { code: 'provider_error', message: 'Incomplete match record.' } }; }
  sources.push({ label: 'Match record', source: m.source });
  update('fixture', 'done', `${fixture.home.name} vs ${fixture.away.name}`);
  const before = fixture.kickoffUtc; // nothing at or after kickoff is used

  const history = async (id: StageId, team: Fixture['home'], label: string) => {
    update(id, 'running');
    const r = await fdGet<{ matches?: FdMatch[] }>(`/teams/${team.id.replace('fd:', '')}/matches?status=FINISHED&limit=40`, 'Last 40 finished matches available to the free plan');
    if (!r.ok) { update(id, 'failed', r.error.message); failures.push({ label, error: r.error }); return []; }
    sources.push({ label, source: r.source });
    const list = teamHistory(normalizeMatches(r.data.matches ?? []), team.id, before);
    update(id, list.length ? 'done' : 'partial', `${list.length} finished matches before kickoff`);
    return list;
  };
  const homeHistory = await history('homeHistory', fixture.home, `${fixture.home.name} matches`);
  const awayHistory = await history('awayHistory', fixture.away, `${fixture.away.name} matches`);

  update('h2h', 'running');
  let h2h: Fixture[] = [];
  const h = await fdGet<{ matches?: FdMatch[] }>(`/matches/${numericId}/head2head?limit=50`, 'Up to 50 meetings available to the free plan');
  if (h.ok) {
    sources.push({ label: 'Head-to-head', source: h.source });
    const cutoff = Date.parse(before);
    h2h = normalizeMatches(h.data.matches ?? [])
      .filter((f) => f.status === 'finished' && Date.parse(f.kickoffUtc) < cutoff && f.id !== fixture.id)
      .reverse();
    update('h2h', 'done', `${h2h.length} past meetings found`);
  } else {
    failures.push({ label: 'Head-to-head', error: h.error });
    update('h2h', 'failed', h.error.message);
  }

  update('league', 'running');
  let leagueFixtures: Fixture[] = [];
  const code = fixture.competition.code;
  const year = seasonYearOf(fixture);
  if (!code) {
    update('league', 'skipped', 'Competition code missing.');
  } else {
    const cur = await fdGet<{ matches?: FdMatch[] }>(`/competitions/${code}/matches?season=${year}&status=FINISHED`, `${fixture.competition.name} ${year}/${year + 1}, finished matches`);
    const prev = await fdGet<{ matches?: FdMatch[] }>(`/competitions/${code}/matches?season=${year - 1}&status=FINISHED`, `${fixture.competition.name} ${year - 1}/${year}, finished matches`);
    if (cur.ok) { sources.push({ label: `League results ${year}/${year + 1}`, source: cur.source }); leagueFixtures.push(...normalizeMatches(cur.data.matches ?? [])); }
    else failures.push({ label: `League results ${year}/${year + 1}`, error: cur.error });
    if (prev.ok) { sources.push({ label: `League results ${year - 1}/${year}`, source: prev.source }); leagueFixtures.push(...normalizeMatches(prev.data.matches ?? [])); }
    else failures.push({ label: `League results ${year - 1}/${year} (previous season)`, error: prev.error });
    leagueFixtures = [...new Map(leagueFixtures.map((f) => [f.id, f])).values()];
    update('league', cur.ok || prev.ok ? (cur.ok && prev.ok ? 'done' : 'partial') : 'failed',
      cur.ok || prev.ok ? `${leagueFixtures.length} league matches${prev.ok ? '' : ' (previous season not available)'}` : 'No league data available.');
  }

  update('model', 'running');
  await yieldToUi();
  let model: ModelOutput | null = null;
  let modelUnavailableReason: string | undefined;
  const rows = toTraining(leagueFixtures, before);
  const homeSample = rows.filter((r) => r.home === fixture.home.id || r.away === fixture.home.id).length;
  const awaySample = rows.filter((r) => r.home === fixture.away.id || r.away === fixture.away.id).length;
  modelUnavailableReason = modelBlocker(fixture, rows.length, homeSample, awaySample);
  if (!modelUnavailableReason) {
    const fit = fitPoisson(rows, before);
    const xg = expectedGoals(fit, fixture.home.id, fixture.away.id);
    const matrix = scoreMatrix(xg.home, xg.away);
    await yieldToUi();
    const range1x2 = bootstrap1x2(rows, before, fixture.home.id, fixture.away.id);
    await yieldToUi();
    const bt = backtest(rows);
    model = {
      fit, xg,
      markets: marketsFromMatrix(matrix, fixture.home.shortName ?? fixture.home.name, fixture.away.shortName ?? fixture.away.name),
      scorelines: topScorelines(matrix),
      range1x2, backtest: bt, homeSample, awaySample,
    };
    update('model', 'done', `Fitted on ${rows.length} league matches`);
  } else {
    update('model', 'skipped', modelUnavailableReason);
  }

  update('report', 'running');
  await yieldToUi();
  update('report', 'done');
  return { ok: true, analysis: { fixture, homeHistory, awayHistory, h2h, model, modelUnavailableReason, sources, failures } };
}
