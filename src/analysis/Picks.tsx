import type { Analysis } from './run';
import { buildPicks, type Pick, type Strength } from '../../shared/model/picks';

const STYLE: Record<Strength, string> = {
  strong: 'border-emerald-500 bg-emerald-950/60 text-emerald-200',
  good: 'border-sky-500 bg-sky-950/60 text-sky-200',
  lean: 'border-slate-500 bg-slate-800 text-slate-200',
  'coin-flip': 'border-slate-700 bg-slate-900 text-slate-400',
};
const LABEL: Record<Strength, string> = { strong: 'Strong', good: 'Good', lean: 'Slight', 'coin-flip': 'Too close' };

function Card({ p, big }: { p: Pick; big?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${STYLE[p.strength]}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{p.market}</div>
      <div className={`font-bold ${big ? 'text-xl' : 'text-base'}`}>{p.pick}</div>
      <div className="flex items-baseline justify-between">
        <span className={`font-semibold tabular-nums ${big ? 'text-2xl' : 'text-lg'}`}>{Math.round(p.p * 100)}%</span>
        <span className="text-xs opacity-80">{LABEL[p.strength]}</span>
      </div>
    </div>
  );
}

export default function Picks({ a }: { a: Analysis }) {
  if (!a.model) {
    return <section className="mb-4 rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-amber-200"><p className="font-semibold">No picks for this match</p><p className="text-sm">{a.modelUnavailableReason}</p></section>;
  }
  const { result, doubleChance, picks } = buildPicks(a.model.markets);
  const score = a.model.scorelines[0]!;
  return (
    <section className="mb-4" aria-label="Picks">
      <h2 className="mb-2 text-lg font-bold">Picks</h2>
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Card p={result} big />
        <Card p={doubleChance} big />
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Most likely score</div>
          <div className="text-xl font-bold">{score.home} – {score.away}</div>
          <div className="text-sm text-slate-400">{Math.round(score.p * 100)}% (exact scores are always unlikely)</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {picks.map((p) => <Card key={p.market} p={p} />)}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Percentages are the model's chance for each pick, from goals in this league only. Injuries and lineups are not included. Nothing is ever 100% sure.
      </p>
    </section>
  );
}
