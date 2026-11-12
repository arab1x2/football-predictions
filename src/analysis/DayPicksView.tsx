import { useEffect, useRef, useState } from 'react';
import type { Fixture } from '../../shared/types';
import type { Pick, Strength } from '../../shared/model/picks';
import { formatKickoff } from '../../shared/time';
import { computeDayPicks, type DayPick } from './dayPicks';

const STYLE: Record<Strength, string> = {
  strong: 'bg-emerald-900/70 text-emerald-200 border-emerald-600',
  good: 'bg-sky-900/70 text-sky-200 border-sky-600',
  lean: 'bg-slate-800 text-slate-200 border-slate-600',
  'coin-flip': 'bg-slate-900 text-slate-500 border-slate-800',
};

function Chip({ p, title }: { p?: Pick; title?: string }) {
  if (!p) return null;
  return (
    <span className={`inline-flex flex-col rounded-md border px-2 py-1 text-xs leading-tight ${STYLE[p.strength]}`}>
      <span className="opacity-75">{title ?? p.market}</span>
      <span className="font-semibold">{p.pick} · {Math.round(p.p * 100)}% <span className="font-normal opacity-70">@{(1 / p.p).toFixed(2)}</span></span>
    </span>
  );
}

type SortKey = 'time' | 'best';

export default function DayPicksView({ fixtures, tz, onAnalyze }: { fixtures: Fixture[]; tz: string; onAnalyze: (id: string) => void }) {
  const [rows, setRows] = useState<DayPick[] | null>(null);
  const [progress, setProgress] = useState('Starting…');
  const [sort, setSort] = useState<SortKey>('best');
  const [onlyStrong, setOnlyStrong] = useState(false);

  const key = fixtures.map((f) => f.id).join(',');
  const latest = useRef(fixtures);
  latest.current = fixtures;
  useEffect(() => {
    const fixtures = latest.current;
    let alive = true;
    setRows(null);
    computeDayPicks(fixtures, (msg, done, total) => alive && setProgress(`${msg} (${done}/${total} competitions)`))
      .then((r) => alive && setRows(r));
    return () => { alive = false; };
  }, [key]);

  if (!rows) return <p className="py-8 text-center text-slate-400" role="status">Calculating picks… {progress}</p>;
  const upcoming = fixtures.filter((f) => f.status === 'scheduled').length;
  if (!upcoming) return <p className="py-8 text-center text-slate-400">No upcoming matches on this date, so no picks.</p>;

  let list = [...rows];
  if (sort === 'best') list.sort((a, b) => (b.best?.p ?? -1) - (a.best?.p ?? -1));
  if (onlyStrong) list = list.filter((r) => r.picks && [r.result, r.doubleChance, ...r.picks].some((p) => p?.strength === 'strong'));

  return (
    <section aria-label="Picks of the day">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">Sort:</span>
        {(['best', 'time'] as const).map((k) => (
          <button key={k} onClick={() => setSort(k)} className={`rounded-md px-3 py-1 ${sort === k ? 'bg-sky-600 text-white' : 'bg-slate-800'}`}>
            {k === 'best' ? 'Strongest first' : 'Kickoff time'}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1">
          <input type="checkbox" checked={onlyStrong} onChange={(e) => setOnlyStrong(e.target.checked)} /> Only matches with a Strong pick
        </label>
      </div>
      {list.length === 0 && <p className="py-6 text-center text-slate-400">No match has a Strong pick today.</p>}
      <ul className="space-y-2">
        {list.map((r) => {
          const f = r.fixture;
          const strongOnly = (p?: Pick) => (onlyStrong && p?.strength !== 'strong' ? undefined : p);
          return (
            <li key={f.id} className="rounded-lg bg-slate-900 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="w-12 text-sm tabular-nums text-slate-400">{formatKickoff(f.kickoffUtc, tz)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{f.home.shortName ?? f.home.name} – {f.away.shortName ?? f.away.name}</span>
                <span className="hidden text-xs text-slate-500 sm:inline">{f.competition.name}</span>
                <button onClick={() => onAnalyze(f.id)} className="rounded-md bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700">Details</button>
              </div>
              {r.reason ? (
                <p className="text-xs text-amber-300">No picks: {r.reason}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  <Chip p={strongOnly(r.result)} title="Result" />
                  <Chip p={strongOnly(r.doubleChance)} />
                  {r.picks!.map((p) => <Chip key={p.market} p={strongOnly(p)} />)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        Green = Strong (75%+), blue = Good (62%+). The number after @ is the fair odds (1 ÷ chance). Model chances from league goals only; injuries and lineups are not included. Nothing is ever 100% sure.
      </p>
    </section>
  );
}
