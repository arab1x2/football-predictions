// Turns a score probability matrix into betting-market style probabilities.
// Every market lists both sides so complements can be checked to sum to 1.

export interface MarketLine {
  market: string;
  outcomes: { label: string; p: number }[];
}

function sum(m: number[][], pred: (h: number, a: number) => boolean): number {
  let s = 0;
  m.forEach((row, h) => row.forEach((p, a) => { if (pred(h, a)) s += p; }));
  return s;
}

export function marketsFromMatrix(m: number[][], homeName: string, awayName: string): MarketLine[] {
  const pH = sum(m, (h, a) => h > a);
  const pD = sum(m, (h, a) => h === a);
  const pA = sum(m, (h, a) => h < a);
  const lines: MarketLine[] = [
    { market: 'Full time result', outcomes: [{ label: `${homeName} win`, p: pH }, { label: 'Draw', p: pD }, { label: `${awayName} win`, p: pA }] },
    { market: 'Double chance 1X', outcomes: [{ label: '1X', p: pH + pD }, { label: `${awayName} win`, p: pA }] },
    { market: 'Double chance X2', outcomes: [{ label: 'X2', p: pD + pA }, { label: `${homeName} win`, p: pH }] },
    { market: 'Double chance 12', outcomes: [{ label: '12', p: pH + pA }, { label: 'Draw', p: pD }] },
    { market: 'Draw no bet', outcomes: [{ label: homeName, p: pH / (pH + pA) }, { label: awayName, p: pA / (pH + pA) }] },
    {
      market: 'Both teams to score',
      outcomes: [{ label: 'Yes', p: sum(m, (h, a) => h > 0 && a > 0) }, { label: 'No', p: sum(m, (h, a) => h === 0 || a === 0) }],
    },
  ];
  for (const t of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    lines.push({
      market: `Total goals ${t}`,
      outcomes: [{ label: `Over ${t}`, p: sum(m, (h, a) => h + a > t) }, { label: `Under ${t}`, p: sum(m, (h, a) => h + a < t) }],
    });
  }
  for (const [name, side] of [[homeName, 0], [awayName, 1]] as const) {
    const g = (h: number, a: number) => (side === 0 ? h : a);
    lines.push({ market: `${name} to score`, outcomes: [{ label: 'Yes (over 0.5)', p: sum(m, (h, a) => g(h, a) > 0) }, { label: 'No (zero goals)', p: sum(m, (h, a) => g(h, a) === 0) }] });
    for (const t of [1.5, 2.5]) {
      lines.push({ market: `${name} goals ${t}`, outcomes: [{ label: `Over ${t}`, p: sum(m, (h, a) => g(h, a) > t) }, { label: `Under ${t}`, p: sum(m, (h, a) => g(h, a) < t) }] });
    }
  }
  return lines;
}

export function topScorelines(m: number[][], n = 6): { home: number; away: number; p: number }[] {
  const all: { home: number; away: number; p: number }[] = [];
  m.forEach((row, h) => row.forEach((p, a) => all.push({ home: h, away: a, p })));
  return all.sort((x, y) => y.p - x.p).slice(0, n);
}
