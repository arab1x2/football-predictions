import { useState } from 'react';
import type { ApiError } from '../../shared/types';
import type { Analysis } from './run';
import {
  ODDS_SPORT_KEYS, edge, matchOddsEvent, summarizeMarket, totalsPoints, type OddsResponse, type PriceSummary,
} from '../../shared/providers/oddsApi';

interface Row { market: string; outcome: string; model: number; price: PriceSummary }

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; error: ApiError }
  | { kind: 'nomatch'; data: OddsResponse }
  | { kind: 'ready'; data: OddsResponse; rows: Row[]; eventName: string };

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildOddsRows(a: Analysis, data: OddsResponse): { rows: Row[]; eventName: string } | null {
  if (!a.model) return null;
  const f = a.fixture;
  const ev = matchOddsEvent(
    { kickoffUtc: f.kickoffUtc, homeNames: [f.home.name, f.home.shortName], awayNames: [f.away.name, f.away.shortName] },
    data.events,
  );
  if (!ev) return null;
  const rows: Row[] = [];
  const find = (name: string) => a.model!.markets.find((m) => m.market === name);
  const ft = find('Full time result');
  const h2h = summarizeMarket(ev, 'h2h', [ev.home_team!, 'Draw', ev.away_team!]);
  if (ft && h2h) ft.outcomes.forEach((o, i) => rows.push({ market: 'Result', outcome: o.label, model: o.p, price: h2h[i]! }));
  for (const point of totalsPoints(ev)) {
    const line = find(`Total goals ${point}`);
    const s = summarizeMarket(ev, 'totals', ['Over', 'Under'], point);
    if (line && s) line.outcomes.forEach((o, i) => rows.push({ market: `Goals ${point}`, outcome: o.label, model: o.p, price: s[i]! }));
  }
  return { rows, eventName: `${ev.home_team} vs ${ev.away_team}` };
}

export default function OddsPanel({ a }: { a: Analysis }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const code = a.fixture.competition.code ?? '';
  if (!a.model) return null;
  if (!ODDS_SPORT_KEYS[code]) return null;

  const load = async () => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/odds?competition=${encodeURIComponent(code)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setState({ kind: 'error', error: body?.error ?? { code: 'provider_error', message: `Server returned HTTP ${res.status}.` } });
        return;
      }
      const data = body as OddsResponse;
      const built = buildOddsRows(a, data);
      setState(built && built.rows.length ? { kind: 'ready', data, ...built } : { kind: 'nomatch', data });
    } catch {
      setState({ kind: 'error', error: { code: 'provider_error', message: 'Could not reach the app server.' } });
    }
  };

  return (
    <section className="mb-4 rounded-lg bg-slate-900 p-4" aria-label="Bookmaker odds">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Bookmaker odds and value</h2>
        {(state.kind === 'idle' || state.kind === 'error') && (
          <button onClick={load} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600">
            Load bookmaker odds
          </button>
        )}
      </div>
      {state.kind === 'idle' && <p className="mt-1 text-xs text-slate-500">Real prices from a licensed odds feed. Uses 2 of 500 free monthly credits per league, then is kept for 12 hours.</p>}
      {state.kind === 'loading' && <p className="mt-2 text-sm text-slate-400" role="status">Loading odds…</p>}
      {state.kind === 'error' && <p className="mt-2 text-sm text-amber-300" role="alert">{state.error.message}</p>}
      {state.kind === 'nomatch' && (
        <p className="mt-2 text-sm text-amber-300">
          Odds were loaded, but this match could not be identified with certainty in the bookmaker list (or it has no prices yet), so nothing is shown rather than risk the wrong match.
        </p>
      )}
      {state.kind === 'ready' && (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr><th className="p-2">Bet</th><th className="p-2">Model</th><th className="p-2">Bookmakers</th><th className="p-2">Fair odds</th><th className="p-2">Best odds</th><th className="p-2">Value</th></tr>
              </thead>
              <tbody>
                {state.rows.map((r) => {
                  const e = edge(r.model, r.price.best);
                  const good = e >= 0.03;
                  return (
                    <tr key={r.market + r.outcome} className="border-t border-slate-800">
                      <td className="p-2"><span className="text-slate-400">{r.market}:</span> {r.outcome}</td>
                      <td className="p-2 tabular-nums">{pct(r.model)}</td>
                      <td className="p-2 tabular-nums text-slate-400">{pct(r.price.marketChance)}</td>
                      <td className="p-2 tabular-nums">{(1 / r.model).toFixed(2)}</td>
                      <td className="p-2 tabular-nums">{r.price.best.toFixed(2)} <span className="text-xs text-slate-500">{r.price.bestBookmaker}</span></td>
                      <td className={`p-2 font-semibold tabular-nums ${good ? 'text-emerald-300' : 'text-slate-500'}`}>{good ? `+${Math.round(e * 100)}%` : 'no'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Matched to "{state.eventName}" · {state.rows[0]?.price.bookmakers} bookmakers · retrieved {new Date(state.data.retrievedAt).toLocaleString('en-GB')}{state.data.fromCache ? ' (cached)' : ''}
            {state.data.creditsRemaining != null ? ` · ${state.data.creditsRemaining} credits left at that time` : ''} · source: The Odds API.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            "Bookmakers" is the chance their prices imply. "Value" appears when the best price is above the model's fair odds. Be careful: bookmakers know about injuries and lineups and this model does not, so a big value is often the model missing something, not free money.
          </p>
        </>
      )}
    </section>
  );
}
