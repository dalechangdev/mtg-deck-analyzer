"use client";

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

const MAX_SHOWN_CMC = 7;
const BAR_COLOR = "#60a5fa";

function buildBins(entries: DeckEntry[]) {
  const landBin = { label: "Land", count: 0, cards: [] as string[] };
  const cmcBins = Array.from({ length: MAX_SHOWN_CMC + 1 }, (_, i) => ({
    label: i === MAX_SHOWN_CMC ? "7+" : String(i),
    count: 0,
    cards: [] as string[],
  }));

  for (const entry of entries) {
    if (entry.slot !== "main" || entry.isCommander) continue;
    if (entry.typeLine.toLowerCase().includes("land")) {
      landBin.count += entry.quantity;
      landBin.cards.push(entry.name);
    } else {
      const bin = Math.min(Math.floor(entry.cmc ?? 0), MAX_SHOWN_CMC);
      cmcBins[bin].count += entry.quantity;
      cmcBins[bin].cards.push(entry.name);
    }
  }

  const bins = [landBin, ...cmcBins];
  return bins.filter((b) => !(b.label === "0" && b.count === 0));
}

interface TooltipPayload {
  payload?: { label: string; count: number; cards: string[] };
}

function CurveTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const { label, count, cards } = payload[0].payload;
  const heading = label === "Land" ? "Lands" : `CMC ${label}`;
  return (
    <div className="bg-background border border-border rounded px-2.5 py-2 text-xs shadow-lg max-w-48">
      <div className="font-semibold mb-1">{heading} — {count} card{count !== 1 ? "s" : ""}</div>
      <ul className="space-y-0.5 text-muted-foreground">
        {cards.slice(0, 8).map((name) => (
          <li key={name} className="truncate">{name}</li>
        ))}
        {cards.length > 8 && (
          <li className="text-muted-foreground/60">+{cards.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}

function BarCountLabel({
  x,
  y,
  width,
  value,
}: {
  x?: number;
  y?: number;
  width?: number;
  value?: number;
}) {
  if (!value) return null;
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

export function ManaCurve({ entries }: Props) {
  const bins = buildBins(entries);
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const spellBins = bins.filter((b) => b.label !== "Land");
  const totalSpells = spellBins.reduce((s, b) => s + b.count, 0);
  const avgCmc =
    totalSpells === 0
      ? 0
      : spellBins.reduce((s, b) => {
          const cmc = b.label === "7+" ? 7 : Number(b.label);
          return s + cmc * b.count;
        }, 0) / totalSpells;

  const tickStyle = { fontSize: 10, style: { fill: "hsl(var(--muted-foreground))" } };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Mana Curve
        </span>
        <span className="text-[11px] text-muted-foreground">
          avg CMC <span className="text-foreground font-medium">{avgCmc.toFixed(2)}</span>
          <span className="mx-1.5 opacity-40">·</span>
          {totalSpells} spell{totalSpells !== 1 ? "s" : ""}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={bins} margin={{ top: 16, right: 0, left: -28, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, maxCount]}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={<CurveTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={32} fill={BAR_COLOR} fillOpacity={0.85}>
            <LabelList dataKey="count" content={<BarCountLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
