import { useEffect, useMemo, useState } from 'react';
import type { ApiError, Fixture, FixturesResponse } from '../shared/types';
import { DEFAULT_TIME_ZONE, addDays, formatKickoff, todayIn } from '../shared/time';
import { fetchFixtures } from './api';
import { teamMatches } from './search';

const TIME_ZONES = [DEFAULT_TIME_ZONE, 'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'America/Sao_Paulo', 'Asia/Dubai'];

type State =
  | { kind: 'loading' }
  | { kind: 'error'; error: ApiError }
  | { kind: 'ready'; data: FixturesResponse };

const STATUS_LABEL: Record<Fixture['status'], string> = {
  scheduled: 'Upcoming',
  live: 'Live',
  finished: 'Finished',
  postponed: 'Postponed',
  suspended: 'Suspended',
  cancelled: 'Cancelled',
  unknown: 'Unknown',
};

const STATUS_STYLE: Record<Fixture['status'], string> = {
  scheduled: 'bg-sky-900/60 text-sky-200',
  live: 'bg-red-900/60 text-red-200',
  finished: 'bg-slate-700 text-slate-200',
  postponed: 'bg-amber-900/60 text-amber-200',
  suspended: 'bg-amber-900/60 text-amber-200',
  cancelled: 'bg-amber-900/60 text-amber-200',
  unknown: 'bg-slate-700 text-slate-300',
};

export default function App() {
  const [tz, setTz] = useState(DEFAULT_TIME_ZONE);
  const today = todayIn(tz);
  const [date, setDate] = useState(today);
  const [query, setQuery] = useState('');
  const [league, setLeague] = useState('all');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchFixtures(date, tz).then((r) => {
      if (cancelled) return;
      setState(r.ok ? { kind: 'ready', data: r.data } : { kind: 'error', error: r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [date, tz, reloadKey]);

  const fixtures = state.kind === 'ready' ? state.data.fixtures : [];
  const leagues = useMemo(
    () => [...new Map(fixtures.map((f) => [f.competition.id, f.competition.name])).entries()],
    [fixtures],
  );
  const visible = fixtures.filter(
    (f) =>
      (league === 'all' || f.competition.id === league) &&
      teamMatches(query, [f.home.name, f.home.shortName, f.home.tla, f.away.name, f.away.shortName, f.away.tla]),
  );
  const groups = useMemo(() => {
    const m = new Map<string, Fixture[]>();
    for (const f of visible) {
      const key = `${f.competition.country ? f.competition.country + ' · ' : ''}${f.competition.name}`;
      m.set(key, [...(m.get(key) ?? []), f]);
    }
    return [...m.entries()];
  }, [visible]);

  const quickDates = [
    { label: 'Yesterday', value: addDays(today, -1) },
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Match Intelligence</h1>
        <p className="text-sm text-slate-400">Real fixtures from free data sources. Nothing is invented: missing data is shown as missing.</p>
      </header>

      <section className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filters">
        <div className="flex gap-1" role="group" aria-label="Quick dates">
          {quickDates.map((d) => (
            <button
              key={d.label}
              onClick={() => setDate(d.value)}
              className={`rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                date === d.value ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="block text-xs text-slate-400">Date</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md bg-slate-800 px-2 py-2 text-slate-100" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-400">Time zone</span>
          <select value={tz} onChange={(e) => setTz(e.target.value)} className="rounded-md bg-slate-800 px-2 py-2">
            {TIME_ZONES.map((z) => <option key={z}>{z}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-400">League</span>
          <select value={league} onChange={(e) => setLeague(e.target.value)} className="rounded-md bg-slate-800 px-2 py-2">
            <option value="all">All leagues</option>
            {leagues.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="min-w-40 flex-1 text-sm">
          <span className="block text-xs text-slate-400">Search team</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Atlético, PSG"
            className="w-full rounded-md bg-slate-800 px-2 py-2 text-slate-100 placeholder:text-slate-500" />
        </label>
      </section>

      {state.kind === 'loading' && <p className="py-10 text-center text-slate-400" role="status">Loading fixtures…</p>}

      {state.kind === 'error' && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4" role="alert">
          <p className="font-semibold text-red-200">
            {state.error.code === 'rate_limited' ? 'Data limit reached' : state.error.code === 'missing_api_key' ? 'Data source not configured' : 'Data source unavailable'}
          </p>
          <p className="text-sm text-red-300">{state.error.message}</p>
          <p className="mt-1 text-xs text-red-400">This is a provider problem, not "no games today".</p>
          <button onClick={() => setReloadKey((k) => k + 1)} className="mt-3 rounded-md bg-red-800 px-3 py-1.5 text-sm hover:bg-red-700">Try again</button>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          {fixtures.length === 0 ? (
            <p className="py-10 text-center text-slate-400">No matches in the covered competitions on {date}.</p>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-slate-400">No match fits your filters.</p>
          ) : (
            groups.map(([name, list]) => (
              <section key={name} className="mb-5">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{name}</h2>
                <ul className="divide-y divide-slate-800 overflow-hidden rounded-lg bg-slate-900">
                  {list.map((f) => <FixtureRow key={f.id} f={f} tz={tz} />)}
                </ul>
              </section>
            ))
          )}
          <footer className="mt-6 rounded-lg bg-slate-900 p-3 text-xs text-slate-400">
            <p>Source: {state.data.source.provider} · retrieved {new Date(state.data.source.retrievedAt).toLocaleString('en-GB', { timeZone: tz })} ({tz}){state.data.source.fromCache ? ' · cached' : ''}</p>
            <p className="mt-1">Coverage: {state.data.source.coverage}</p>
          </footer>
        </>
      )}
    </div>
  );
}

function FixtureRow({ f, tz }: { f: Fixture; tz: string }) {
  const showScore = (f.status === 'live' || f.status === 'finished') && f.fullTime;
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <div className="w-14 shrink-0 text-sm tabular-nums text-slate-300">{formatKickoff(f.kickoffUtc, tz)}</div>
      <div className="min-w-0 flex-1">
        <TeamLine name={f.home.shortName ?? f.home.name} crest={f.home.crestUrl} score={showScore ? f.fullTime?.home : undefined} />
        <TeamLine name={f.away.shortName ?? f.away.name} crest={f.away.crestUrl} score={showScore ? f.fullTime?.away : undefined} />
      </div>
      <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${STATUS_STYLE[f.status]}`}>{STATUS_LABEL[f.status]}</span>
      <button disabled title="Deep Analyze arrives in step 3"
        className="hidden shrink-0 cursor-not-allowed rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-500 sm:block">
        Deep Analyze (soon)
      </button>
    </li>
  );
}

function TeamLine({ name, crest, score }: { name: string; crest?: string; score?: number | null }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {crest ? <img src={crest} alt="" className="h-4 w-4 object-contain" loading="lazy" /> : <span className="h-4 w-4" />}
      <span className="truncate">{name}</span>
      {score != null && <span className="ml-auto font-semibold tabular-nums">{score}</span>}
    </div>
  );
}
