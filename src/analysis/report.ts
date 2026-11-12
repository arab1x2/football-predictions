// Deterministic, data-driven report sentences. No AI, no invented claims:
// every sentence is computed from the records passed in.
import type { Analysis } from './run';
import { summarize, windows, restDays, type FormSummary } from '../../shared/stats';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const avg = (a: number, n: number) => (n ? (a / n).toFixed(2) : 'n/a');

function formLine(name: string, s: FormSummary, label: string): string {
  if (!s.n) return `${name}: no finished matches available for ${label}.`;
  return `${name}, ${label} (${s.n} matches): ${s.w}W ${s.d}D ${s.l}L, ${s.gf} scored and ${s.ga} conceded (${avg(s.gf, s.n)} / ${avg(s.ga, s.n)} per match), ${s.cleanSheets} clean sheets, failed to score ${s.failedToScore} times.`;
}

export interface ReportSection { title: string; paragraphs: string[] }

export function buildReport(a: Analysis): ReportSection[] {
  const f = a.fixture;
  const H = f.home.shortName ?? f.home.name;
  const A = f.away.shortName ?? f.away.name;
  const hw = windows(a.homeHistory);
  const aw = windows(a.awayHistory);
  const sections: ReportSection[] = [];

  sections.push({
    title: 'Recent form',
    paragraphs: [
      formLine(H, hw.last5, 'last 5'), formLine(H, hw.last10, 'last 10'),
      formLine(A, aw.last5, 'last 5'), formLine(A, aw.last10, 'last 10'),
      'These counts mix competitions and do not adjust for opponent strength. The model below does adjust for it, within the league.',
    ],
  });

  const hr = restDays(a.homeHistory, f.kickoffUtc);
  const ar = restDays(a.awayHistory, f.kickoffUtc);
  sections.push({
    title: 'Home and away, rest',
    paragraphs: [
      formLine(H, hw.home, 'home matches only'),
      formLine(A, aw.away, 'away matches only'),
      `Days since last recorded match: ${H} ${hr ?? 'unknown'}, ${A} ${ar ?? 'unknown'}. Matches in competitions outside the free plan may be missing, so real rest could be shorter.`,
    ],
  });

  const hh = hw.last20, ah = aw.last20;
  sections.push({
    title: 'First half and second half',
    paragraphs: [
      hh.htN ? `${H}: over ${hh.htN} matches with a half-time score, ${hh.htGf} goals scored in first halves and ${hh.secondHalfGf} in second halves.` : `${H}: no half-time scores available.`,
      ah.htN ? `${A}: over ${ah.htN} matches with a half-time score, ${ah.htGf} goals scored in first halves and ${ah.secondHalfGf} in second halves.` : `${A}: no half-time scores available.`,
      a.model?.halves
        ? `Model expected goals: first half ${H} ${a.model.halves.xgFirst.home.toFixed(2)}, ${A} ${a.model.halves.xgFirst.away.toFixed(2)}; second half ${H} ${a.model.halves.xgSecond.home.toFixed(2)}, ${A} ${a.model.halves.xgSecond.away.toFixed(2)} (separate models fitted on ${a.model.halves.nMatches} league matches with real half-time scores).`
        : `Half markets are not shown: ${a.model?.halvesUnavailableReason ?? 'the model is not available for this match.'}`,
    ],
  });

  const h2hParas: string[] = [];
  if (!a.h2h.length) h2hParas.push('No past meetings were found in the accessible data. This does not mean the teams have never met.');
  else {
    const views = a.h2h.map((m) => {
      const homeIsH = m.home.id === f.home.id;
      const gf = (homeIsH ? m.fullTime?.home : m.fullTime?.away) ?? 0;
      const ga = (homeIsH ? m.fullTime?.away : m.fullTime?.home) ?? 0;
      return { gf, ga };
    });
    const w = views.filter((v) => v.gf > v.ga).length, d = views.filter((v) => v.gf === v.ga).length;
    const goals = views.reduce((s, v) => s + v.gf + v.ga, 0);
    const btts = views.filter((v) => v.gf > 0 && v.ga > 0).length;
    const first = a.h2h[a.h2h.length - 1]!.kickoffUtc.slice(0, 10);
    h2hParas.push(`${a.h2h.length} accessible meetings since ${first}: ${H} won ${w}, ${d} draws, ${A} won ${a.h2h.length - w - d}. Average ${(goals / a.h2h.length).toFixed(2)} goals per meeting, both teams scored in ${btts}.`);
    h2hParas.push('Head-to-head history has limited weight: squads and coaches change. It is shown for context and is not an input to the model.');
  }
  sections.push({ title: 'Head-to-head', paragraphs: h2hParas });

  sections.push({
    title: 'Injuries, suspensions and lineups',
    paragraphs: ['No verified injury or lineup data is connected yet. That is not the same as "no injuries". Check official club channels before relying on any prediction.'],
  });
  sections.push({
    title: 'Corners, cards, penalties and xG',
    paragraphs: ['The free football-data.org plan does not provide corners, cards, penalties, shots or xG, so these are not shown and not estimated.'],
  });

  if (a.model) {
    const m = a.model;
    const r = m.markets[0]!.outcomes;
    const best = [...m.markets.slice(5)].flatMap((l) => l.outcomes.map((o) => ({ ...o, market: l.market })))
      .filter((o) => o.p >= 0.6).sort((x, y) => y.p - x.p).slice(0, 4);
    sections.push({
      title: 'Model summary',
      paragraphs: [
        `Expected goals from the model (not measured xG): ${H} ${m.xg.home.toFixed(2)}, ${A} ${m.xg.away.toFixed(2)}.`,
        `1X2: ${H} ${pct(r[0]!.p)} (range ${pct(m.range1x2[0]!.low)}–${pct(m.range1x2[0]!.high)}), draw ${pct(r[1]!.p)} (${pct(m.range1x2[1]!.low)}–${pct(m.range1x2[1]!.high)}), ${A} ${pct(r[2]!.p)} (${pct(m.range1x2[2]!.low)}–${pct(m.range1x2[2]!.high)}). Ranges come from refitting on resampled data and show how much the estimate moves.`,
        best.length ? `Strongest goal-market estimates: ${best.map((b) => `${b.market}: ${b.label} ${pct(b.p)}`).join('; ')}.` : 'No goal market reaches 60% for one side.',
        `Sample: fitted on ${m.fit.nMatches} league matches, with ${m.homeSample} for ${H} and ${m.awaySample} for ${A}.`,
      ],
    });
    sections.push({
      title: 'What could make this wrong',
      paragraphs: [
        'The model sees only goals in this competition. It does not know about injuries, rotation, motivation, weather or tactical changes.',
        m.backtest
          ? (m.backtest.modelBrier < m.backtest.baselineBrier
            ? `In a chronological test on ${m.backtest.nPredicted} past league matches, the model beat a simple home/draw/away baseline (Brier ${m.backtest.modelBrier.toFixed(3)} vs ${m.backtest.baselineBrier.toFixed(3)}; lower is better).`
            : `Caution: in a chronological test on ${m.backtest.nPredicted} past league matches, the model did NOT beat a simple baseline (Brier ${m.backtest.modelBrier.toFixed(3)} vs ${m.backtest.baselineBrier.toFixed(3)}).`)
          : 'Not enough league history to run a chronological accuracy test.',
        'A high probability is not a good bet by itself. Probabilities are estimates, not certainties.',
      ],
    });
  } else {
    sections.push({ title: 'Model summary', paragraphs: [a.modelUnavailableReason ?? 'Model not available.'] });
  }
  return sections;
}

export { summarize };
