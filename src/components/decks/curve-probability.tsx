"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { DeckEntry } from "@/lib/commander";

// ── Hypergeometric core ───────────────────────────────────────────────────────

// Precomputed log-factorials; supports decks up to 250 cards.
const LOG_FACT = (() => {
  const f = [0];
  for (let i = 1; i <= 250; i++) f.push(f[i - 1] + Math.log(i));
  return f;
})();

function logC(n: number, k: number): number {
  if (k < 0 || k > n || n < 0) return -Infinity;
  if (k === 0 || k === n) return 0;
  return LOG_FACT[n] - LOG_FACT[k] - LOG_FACT[n - k];
}

// Expand the bitmask of achievable mana sums by optionally playing 0..m cards
// of cost `k`, where bit i being set means sum i is reachable.
function expandMask(mask: number, k: number, m: number, cap: number): number {
  let r = mask;
  for (let i = 0; i < m; i++) {
    let added = 0;
    for (let s = 0; s <= cap - k; s++) {
      if ((r >> s) & 1) added |= 1 << (s + k);
    }
    r |= added;
  }
  return r;
}

// P(a hand of min(D, turn+6) cards drawn from a D-card deck contains a subset
// of non-land spells totalling exactly `turn` mana).
//
// Method: multivariate hypergeometric DP, processing one CMC group at a time.
// State dp[j][s] = probability of having drawn j cards from processed CMC groups,
// with achievable-sum bitmask s. The conditional draw probability for each group
// follows directly from the hypergeometric PMF.
function onCurveProb(turn: number, cmcCounts: Map<number, number>, D: number): number {
  const H = Math.min(D, turn + 6);
  const relevant: [number, number][] = []; // [cmc, count]
  for (let k = 1; k <= turn; k++) {
    const n = cmcCounts.get(k) ?? 0;
    if (n > 0) relevant.push([k, n]);
  }
  if (relevant.length === 0) return 0;

  // Bitmask encodes sums 0..turn; MASKS = 2^(turn+1).
  // For any s in [2^turn, MASKS), bit `turn` is always set (leading bit in range).
  const MASKS = 1 << (turn + 1);
  let dp = new Float64Array((H + 1) * MASKS);
  dp[1] = 1.0; // j=0, mask=0b1 → only sum 0 achievable

  let R = D; // cards not yet processed by the DP

  for (const [k, n] of relevant) {
    const newDp = new Float64Array((H + 1) * MASKS);
    const Rn = R - n; // deck remaining after excluding this CMC group

    for (let j = 0; j <= H; j++) {
      for (let s = 0; s < MASKS; s++) {
        const p = dp[j * MASKS + s];
        if (p === 0) continue;

        // P(draw m of this CMC | drew j from prior groups) = C(n,m)*C(Rn,H-j-m)/C(R,H-j)
        const denom = logC(R, H - j);
        const maxM = Math.min(n, H - j);

        for (let m = 0; m <= maxM; m++) {
          const lp = logC(n, m) + logC(Rn, H - j - m) - denom;
          const tp = isFinite(lp) ? Math.exp(lp) : 0;
          if (tp === 0) continue;

          newDp[(j + m) * MASKS + expandMask(s, k, m, turn)] += p * tp;
        }
      }
    }

    dp = newDp;
    R = Rn;
  }

  // Sum states where `turn` appears in the achievable set.
  // All s in [2^turn, MASKS) have the target bit set by construction.
  const bit = 1 << turn;
  let total = 0;
  for (let j = 0; j <= H; j++) {
    for (let s = bit; s < MASKS; s++) {
      total += dp[j * MASKS + s];
    }
  }
  return Math.min(1, total);
}

function computeProbabilities(entries: DeckEntry[]): number[] {
  const main = entries.filter((e) => e.slot === "main" && !e.isCommander);
  const D = main.reduce((sum, e) => sum + e.quantity, 0);
  if (D === 0) return Array(9).fill(0);

  const cmcCounts = new Map<number, number>();
  for (const e of main) {
    if (!e.typeLine.toLowerCase().includes("land")) {
      const c = Math.floor(e.cmc ?? 0);
      cmcCounts.set(c, (cmcCounts.get(c) ?? 0) + e.quantity);
    }
  }

  return Array.from({ length: 9 }, (_, i) => onCurveProb(i + 1, cmcCounts, D));
}

// ── Chart ─────────────────────────────────────────────────────────────────────

const BAR_COLOR = "#60a5fa";

interface BinData {
  label: string;
  probability: number;
  pct: string;
}

function ProbTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: BinData }>;
}) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const { label, pct } = payload[0].payload;
  return (
    <div className="bg-background border border-border rounded px-2.5 py-2 text-xs shadow-lg">
      <div className="font-semibold mb-0.5">Turn {label}</div>
      <div className="text-muted-foreground">{pct} chance of playing on curve</div>
    </div>
  );
}

function ProbLabel({
  x,
  y,
  width,
  value,
}: {
  x?: number;
  y?: number;
  width?: number;
  value?: string;
}) {
  if (!value || value === "0%") return null;
  return (
    <text
      x={(x ?? 0) + (width ?? 0) / 2}
      y={(y ?? 0) - 3}
      textAnchor="middle"
      fontSize={10}
      style={{ fill: "hsl(var(--foreground))" }}
    >
      {value}
    </text>
  );
}

interface Props {
  entries: DeckEntry[];
}

export function CurveProbability({ entries }: Props) {
  const probs = useMemo(() => computeProbabilities(entries), [entries]);

  const data: BinData[] = probs.map((p, i) => ({
    label: String(i + 1),
    probability: Math.round(p * 100),
    pct: `${Math.round(p * 100)}%`,
  }));

  const tickStyle = { fontSize: 10, style: { fill: "hsl(var(--muted-foreground))" } };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          On-Curve Probability
        </span>
        <span className="text-[11px] text-muted-foreground">exact · hypergeometric</span>
      </div>

      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ top: 16, right: 0, left: -10, bottom: 0 }}>
          <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={<ProbTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
          <Bar
            dataKey="probability"
            radius={[3, 3, 0, 0]}
            maxBarSize={32}
            fill={BAR_COLOR}
            fillOpacity={0.85}
          >
            <LabelList dataKey="pct" content={<ProbLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
