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

const NUM_SIMS = 10_000;
const BAR_COLOR = "#60a5fa";

type SimCard = { cmc: number; isLand: boolean };

function shuffle(arr: SimCard[]): SimCard[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns indices (into `cmcs`) of a subset summing to `target`, or null.
function findSubset(cmcs: number[], target: number, start = 0): number[] | null {
  if (target === 0) return [];
  if (start >= cmcs.length || target < 0) return null;
  const with_ = findSubset(cmcs, target - cmcs[start], start + 1);
  if (with_ !== null) return [start, ...with_];
  return findSubset(cmcs, target, start + 1);
}

function runSimulation(entries: DeckEntry[]): number[] {
  const allCards: SimCard[] = entries
    .filter((e) => e.slot === "main" && !e.isCommander)
    .flatMap((e) =>
      Array.from({ length: e.quantity }, () => ({
        cmc: e.cmc ?? 0,
        isLand: e.typeLine.toLowerCase().includes("land"),
      }))
    );

  if (allCards.length === 0) return Array(9).fill(0);

  const successes = new Array(9).fill(0);

  for (let s = 0; s < NUM_SIMS; s++) {
    const deck = shuffle(allCards);
    // Opening hand of 7; deckIdx tracks the next card to draw.
    const hand: SimCard[] = deck.slice(0, 7);
    let deckIdx = 7;

    for (let turn = 1; turn <= 9; turn++) {
      if (turn > 1 && deckIdx < deck.length) hand.push(deck[deckIdx++]);

      // Collect non-land cards and their hand positions.
      const spellPos: number[] = [];
      const spellCmcs: number[] = [];
      for (let i = 0; i < hand.length; i++) {
        if (!hand[i].isLand) {
          spellPos.push(i);
          spellCmcs.push(hand[i].cmc);
        }
      }

      // Can we spend exactly `turn` mana? Combinations of any number of cards are valid.
      const subset = findSubset(spellCmcs, turn);
      if (subset !== null) {
        successes[turn - 1]++;
        // Remove played cards back-to-front so earlier indices stay valid.
        const toRemove = subset.map((p) => spellPos[p]).sort((a, b) => b - a);
        for (const i of toRemove) hand.splice(i, 1);
      } else {
        // Off-curve: play the single most expensive affordable spell so the hand doesn't stagnate.
        let bestIdx = -1;
        let bestCmc = -1;
        for (let i = 0; i < hand.length; i++) {
          if (!hand[i].isLand && hand[i].cmc <= turn && hand[i].cmc > bestCmc) {
            bestIdx = i;
            bestCmc = hand[i].cmc;
          }
        }
        if (bestIdx !== -1) hand.splice(bestIdx, 1);
      }
    }
  }

  return successes.map((s) => s / NUM_SIMS);
}

interface BinData {
  label: string;
  probability: number;
  pct: string;
}

interface TooltipPayload {
  payload?: BinData;
}

function ProbTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
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
  const probs = useMemo(() => runSimulation(entries), [entries]);

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
        <span className="text-[11px] text-muted-foreground">
          simulated · {NUM_SIMS.toLocaleString()} games
        </span>
      </div>

      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ top: 16, right: 0, left: -10, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
          />
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
