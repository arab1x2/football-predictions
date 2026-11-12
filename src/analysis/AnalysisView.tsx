import { useEffect, useState } from 'react';
import { STAGES, runAnalysis, type Analysis, type Stage, type StageId, type StageStatus } from './run';
import { buildReport } from './report';
import Picks from './Picks';
import { formatKickoff, localDateOf } from '../../shared/time';
import type { ApiError } from '../../shared/types';
import type { TeamMatchView } from '../../shared/stats';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ICON: Record<StageStatus, string> = { pending: '○', running: '…', done: '✓', partial: '◐', failed: '✕', skipped: '–' };
const COLOR: Record<StageStatus, string> = {
  pending: 'text-slate-500', running: 'text-sky-300', done: 'text-emerald-300', partial: 'text-amber-300', failed: 'text-red-300', skipped: 'text-slate-400',
};
const TABS = ['Report', 'All markets', 'Form', 'Head-to-head', 'Method & sources'] as const;

export default function AnalysisView({ matchId, tz, onBack }: { matchId: string; tz: string; onBack: () => void }) {
  const [stages, setStages] = useState<Stage[]>(STAGES.map((s) => ({ ...s })));
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number] | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    let alive = true;
    setStages(STAGES.map((s) => ({ ...s })));
    setResult(null);
    setError(null);
    const update = (id: StageId, status: StageStatus, detail?: string) =>
      alive && setStages((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
    runAnalysis(matchId, update).then((r) => {
      if (!alive) return;
      if (r.ok) setResult(r.analysis); else setError(r.error);
    });
    return () => { alive = false; };
  }, [matchId, run]);

  const f = result?.fixture;
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex gap-2">
        <button onClick={onBack} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">← Matches</button>
        <button onClick={() => setRun((n) => n + 1)} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">Re-analyze</button>
        {result && <button onClick={() => window.print()} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">Print</button>}
      </div>

      {f && (
        <header className="mb-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">{f.competition.name}{f.matchday ? ` · Matchday ${f.matchday}` : ''}</p>
          <h1 className="text-2xl font-bold">{f.home.name} vs {f.away.name}</h1>
          <p className="text-sm text-slate-400">{localDateOf(f.kickoffUtc, tz)} at {formatKickoff(f.kickoffUtc, tz)} ({tz}) · status: {f.rawStatus}</p>
        </header>
      )}

      <details open={!result} aria-label="Research progress" className="mb-5 rounded-lg bg-slate-900 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-300">{result ? 'Research steps (done)' : 'Researching…'}</summary>
        <ol className="space-y-1 text-sm">
          {stages.map((s) => (
            <li key={s.id} className="flex gap-2">
              <span className={`w-4 ${COLOR[s.status]}`} aria-hidden>{ICON[s.status]}</span>
              <span className={COLOR[s.status]}>{s.label}</span>
              {s.detail && <span className="text-slate-500">· {s.detail}</span>}
            </li>
          ))}
        </ol>
      </details>

      {error && <div role="alert" className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-red-200">{error.message}</div>}

      {result && (
        <>
          <Picks a={result} />
          {result.model && <OneXTwo a={result} />}
          <p className="mb-2 text-sm text-slate-400">More details (optional):</p>
          <div role="tablist" className="mb-3 flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(tab === t ? null : t)}
                className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? 'bg-sky-600 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}>{t}</button>
            ))}
          </div>
          {tab === 'Report' && <Report a={result} />}
          {tab === 'All markets' && <Markets a={result} />}
          {tab === 'Form' && <Form a={result} tz={tz} />}
          {tab === 'Head-to-head' && <H2H a={result} tz={tz} />}
          {tab === 'Method & sources' && <Method a={result} tz={tz} />}
        </>
      )}
    </div>
  );
}

function OneXTwo({ a }: { a: Analysis }) {
  const o = a.model!.markets[0]!.outcomes;
  const colors = ['bg-sky-500', 'bg-slate-400', 'bg-amber-500'];
  return (
    <section className="mb-4 rounded-lg bg-slate-900 p-4" aria-label="Win draw win probabilities">
      <div className="flex h-4 overflow-hidden rounded">
        {o.map((x, i) => <div key={x.label} className={colors[i]} style={{ width: `${x.p * 100}%` }} />)}
      </div>
      <div className="mt-2 grid grid-cols-3 text-center text-sm">
        {o.map((x, i) => (
          <div key={x.label}>
            <div className="font-semibold">{pct(x.p)}</div>
            <div className="text-xs text-slate-400">{x.label}</div>
            <div className="text-xs text-slate-500">range {pct(a.model!.range1x2[i]!.low)}–{pct(a.model!.range1x2[i]!.high)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Model estimate, not a certainty. Expected goals (model): {a.model!.xg.home.toFixed(2)} – {a.model!.xg.away.toFixed(2)}</p>
    </section>
  );
}

function Report({ a }: { a: Analysis }) {
  return (
    <div className="space-y-4">
      {buildReport(a).map((s) => (
        <section key={s.title} className="rounded-lg bg-slate-900 p-4">
          <h3 className="mb-2 font-semibold">{s.title}</h3>
          {s.paragraphs.map((p, i) => <p key={i} className="mb-1 text-sm text-slate-300">{p}</p>)}
        </section>
      ))}
    </div>
  );
}

function Markets({ a }: { a: Analysis }) {
  if (!a.model) return <p className="rounded-lg bg-slate-900 p-4 text-sm text-slate-300">{a.modelUnavailableReason}</p>;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-400"><tr><th className="p-2">Market</th><th className="p-2">Outcomes</th><th className="p-2 text-right">Sum</th></tr></thead>
          <tbody>
            {a.model.markets.map((m) => (
              <tr key={m.market} className="border-t border-slate-800">
                <td className="p-2">{m.market}</td>
                <td className="p-2">{m.outcomes.map((o) => `${o.label} ${pct(o.p)}`).join(' · ')}</td>
                <td className="p-2 text-right tabular-nums text-slate-500">{pct(m.outcomes.reduce((s, o) => s + o.p, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="mb-2 font-semibold">Most likely scorelines (estimates)</h3>
        <ul className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
          {a.model.scorelines.map((s) => <li key={`${s.home}-${s.away}`} className="rounded bg-slate-800 p-2 text-center"><div className="font-semibold">{s.home}–{s.away}</div><div className="text-xs text-slate-400">{pct(s.p)}</div></li>)}
        </ul>
      </section>
      <p className="text-xs text-slate-500">Half-time and corner markets are not shown: they need data or models not yet available.</p>
    </div>
  );
}

function MatchTable({ rows, tz }: { rows: TeamMatchView[]; tz: string }) {
  if (!rows.length) return <p className="p-3 text-sm text-slate-400">No finished matches available.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-400"><tr><th className="p-2">Date</th><th className="p-2">Comp.</th><th className="p-2">H/A</th><th className="p-2">Opponent</th><th className="p-2">FT</th><th className="p-2">HT</th><th className="p-2">Res.</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.fixture.id} className="border-t border-slate-800">
              <td className="p-2 tabular-nums">{localDateOf(m.fixture.kickoffUtc, tz)}</td>
              <td className="p-2">{m.fixture.competition.code ?? m.fixture.competition.name}</td>
              <td className="p-2">{m.venue === 'home' ? 'H' : 'A'}</td>
              <td className="p-2">{m.opponent}</td>
              <td className="p-2 tabular-nums">{m.gf}–{m.ga}</td>
              <td className="p-2 tabular-nums">{m.htGf != null ? `${m.htGf}–${m.htGa}` : 'n/a'}</td>
              <td className={`p-2 font-semibold ${m.result === 'W' ? 'text-emerald-300' : m.result === 'L' ? 'text-red-300' : 'text-slate-300'}`}>{m.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Form({ a, tz }: { a: Analysis; tz: string }) {
  const [n, setN] = useState(10);
  return (
    <div className="space-y-4">
      <div className="flex gap-1">{[5, 10, 20].map((k) => <button key={k} onClick={() => setN(k)} className={`rounded-md px-3 py-1 text-sm ${n === k ? 'bg-sky-600' : 'bg-slate-800'}`}>Last {k}</button>)}</div>
      {[[a.fixture.home.name, a.homeHistory], [a.fixture.away.name, a.awayHistory]].map(([name, rows]) => (
        <section key={name as string} className="rounded-lg bg-slate-900">
          <h3 className="p-3 pb-0 font-semibold">{name as string}</h3>
          <MatchTable rows={(rows as TeamMatchView[]).slice(0, n)} tz={tz} />
        </section>
      ))}
    </div>
  );
}

function H2H({ a, tz }: { a: Analysis; tz: string }) {
  if (!a.h2h.length) return <p className="rounded-lg bg-slate-900 p-4 text-sm text-slate-300">No past meetings found in the accessible data.</p>;
  return (
    <div className="overflow-x-auto rounded-lg bg-slate-900">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-400"><tr><th className="p-2">Date</th><th className="p-2">Comp.</th><th className="p-2">Home</th><th className="p-2">FT</th><th className="p-2">HT</th><th className="p-2">Away</th></tr></thead>
        <tbody>
          {a.h2h.map((m) => (
            <tr key={m.id} className="border-t border-slate-800">
              <td className="p-2 tabular-nums">{localDateOf(m.kickoffUtc, tz)}</td>
              <td className="p-2">{m.competition.code ?? m.competition.name}</td>
              <td className="p-2">{m.home.name}</td>
              <td className="p-2 tabular-nums">{m.fullTime ? `${m.fullTime.home}–${m.fullTime.away}` : 'n/a'}</td>
              <td className="p-2 tabular-nums">{m.halfTime ? `${m.halfTime.home}–${m.halfTime.away}` : 'n/a'}</td>
              <td className="p-2">{m.away.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Method({ a, tz }: { a: Analysis; tz: string }) {
  const m = a.model;
  return (
    <div className="space-y-4 text-sm">
      <section className="rounded-lg bg-slate-900 p-4 text-slate-300">
        <h3 className="mb-2 font-semibold text-slate-100">Method</h3>
        <p>Model {m?.fit.version ?? 'poisson-0.1'}: Poisson goals model with home advantage, attack and defence strength per team, fitted on this competition's finished matches before kickoff (current and previous season when available). Older matches count less (half-life {m?.fit.options.halfLifeDays ?? 180} days), and every team is pulled toward the league average to avoid overreacting to small samples. These settings are starting choices, not yet tuned by backtesting.</p>
        {m?.backtest && (
          <div className="mt-3">
            <p>Chronological check on {m.backtest.nPredicted} league matches (each predicted only from earlier matches): Brier {m.backtest.modelBrier.toFixed(3)} vs baseline {m.backtest.baselineBrier.toFixed(3)}; log loss {m.backtest.modelLogLoss.toFixed(3)} vs {m.backtest.baselineLogLoss.toFixed(3)}. Lower is better.</p>
            <table className="mt-2 text-xs"><thead className="text-slate-400"><tr><th className="pr-4 text-left">Home-win bucket</th><th className="pr-4">Predicted</th><th className="pr-4">Observed</th><th>Matches</th></tr></thead>
              <tbody>{m.backtest.calibration.map((c) => <tr key={c.bucket}><td className="pr-4">{c.bucket}</td><td className="pr-4 text-center">{pct(c.predicted)}</td><td className="pr-4 text-center">{pct(c.observed)}</td><td className="text-center">{c.n}</td></tr>)}</tbody></table>
          </div>
        )}
      </section>
      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="mb-2 font-semibold">Sources</h3>
        <ul className="space-y-2">
          {a.sources.map((s) => (
            <li key={s.label} className="text-slate-300">
              <span className="font-medium">{s.label}</span> · {s.source.provider} · retrieved {new Date(s.source.retrievedAt).toLocaleString('en-GB', { timeZone: tz })}{s.source.fromCache ? ' (cached)' : ''}
              <div className="break-all text-xs text-slate-500">{s.source.endpoint} · {s.source.coverage}</div>
            </li>
          ))}
        </ul>
        {a.failures.length > 0 && (
          <>
            <h3 className="mb-2 mt-4 font-semibold text-amber-300">Missing or failed</h3>
            <ul className="space-y-1">{a.failures.map((x) => <li key={x.label} className="text-amber-200">{x.label}: {x.error.message}</li>)}</ul>
          </>
        )}
        <p className="mt-3 text-xs text-slate-500">Not connected yet: injuries, lineups, news, corners, shots, xG.</p>
      </section>
    </div>
  );
}
