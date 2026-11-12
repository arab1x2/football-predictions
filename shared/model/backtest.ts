// Chronological backtest: each match is predicted only from matches played
// before it (refit once per 7-day block), so no future information leaks in.
import { fitPoisson, expectedGoals, scoreMatrix, type FitOptions, type TrainingMatch, DEFAULT_FIT } from './poisson';

export interface BacktestResult {
  nPredicted: number;
  modelBrier: number;
  baselineBrier: number;
  modelLogLoss: number;
  baselineLogLoss: number;
  /** Calibration of home-win probabilities in 10-point buckets. */
  calibration: { bucket: string; predicted: number; observed: number; n: number }[];
}

export function backtest(rows: TrainingMatch[], minTrain = 40, opts: FitOptions = { ...DEFAULT_FIT, rounds: 25 }): BacktestResult | null {
  const sorted = [...rows].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  if (sorted.length < minTrain + 20) return null;
  let mb = 0, bb = 0, ml = 0, bl = 0, n = 0;
  const cal = Array.from({ length: 10 }, () => ({ p: 0, o: 0, n: 0 }));
  let i = minTrain;
  while (i < sorted.length) {
    const blockStart = Date.parse(sorted[i]!.kickoffUtc);
    const asOf = sorted[i]!.kickoffUtc;
    const train = sorted.filter((r) => Date.parse(r.kickoffUtc) < blockStart);
    const fit = fitPoisson(train, asOf, opts);
    // Baseline: home/draw/away frequencies from the same training data.
    const fH = train.filter((r) => r.hg > r.ag).length / train.length;
    const fD = train.filter((r) => r.hg === r.ag).length / train.length;
    const base = [fH, fD, 1 - fH - fD];
    let j = i;
    while (j < sorted.length && Date.parse(sorted[j]!.kickoffUtc) < blockStart + 7 * 86_400_000) {
      const r = sorted[j]!;
      const xg = expectedGoals(fit, r.home, r.away);
      const m = scoreMatrix(xg.home, xg.away);
      let pH = 0, pD = 0;
      m.forEach((row, h) => row.forEach((p, a) => { if (h > a) pH += p; else if (h === a) pD += p; }));
      const pred = [pH, pD, 1 - pH - pD];
      const actual = r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2;
      const y = [0, 0, 0]; y[actual] = 1;
      mb += pred.reduce((s, p, k) => s + (p - y[k]!) ** 2, 0);
      bb += base.reduce((s, p, k) => s + (p - y[k]!) ** 2, 0);
      ml += -Math.log(Math.max(pred[actual]!, 1e-9));
      bl += -Math.log(Math.max(base[actual]!, 1e-9));
      const b = cal[Math.min(9, Math.floor(pH * 10))]!;
      b.p += pH; b.o += actual === 0 ? 1 : 0; b.n++;
      n++; j++;
    }
    i = j;
  }
  return {
    nPredicted: n,
    modelBrier: mb / n,
    baselineBrier: bb / n,
    modelLogLoss: ml / n,
    baselineLogLoss: bl / n,
    calibration: cal
      .map((c, k) => ({ bucket: `${k * 10}-${k * 10 + 10}%`, predicted: c.n ? c.p / c.n : 0, observed: c.n ? c.o / c.n : 0, n: c.n }))
      .filter((c) => c.n > 0),
  };
}

/** Bootstrap range for 1X2: resample training matches and refit. */
export function bootstrap1x2(rows: TrainingMatch[], asOf: string, home: string, away: string, reps = 30, seed = 42) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const res: number[][] = [];
  for (let k = 0; k < reps; k++) {
    const sample = rows.map(() => rows[Math.floor(rand() * rows.length)]!);
    const fit = fitPoisson(sample, asOf, { ...DEFAULT_FIT, rounds: 25 });
    const xg = expectedGoals(fit, home, away);
    const m = scoreMatrix(xg.home, xg.away);
    let pH = 0, pD = 0;
    m.forEach((row, h) => row.forEach((p, a) => { if (h > a) pH += p; else if (h === a) pD += p; }));
    res.push([pH, pD, 1 - pH - pD]);
  }
  const q = (k: number, f: number) => {
    const v = res.map((r) => r[k]!).sort((a, b) => a - b);
    return v[Math.min(v.length - 1, Math.floor(f * v.length))]!;
  };
  return [0, 1, 2].map((k) => ({ low: q(k, 0.1), high: q(k, 0.9) }));
}
