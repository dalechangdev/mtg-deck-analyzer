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
import { SectionLabel } from "@/components/ui/section-header";
import { curveAverage, curveBins, type CurveBin } from "@/lib/deck-version";

const BAR_COLOR = "#60a5fa";
/**
 * The baseline in a comparison. The neutral chart token, so the version under
 * inspection keeps the same colour it has in the builder.
 */
const BASELINE_COLOR = "var(--chart-2)";

const tickStyle = { fontSize: 10, style: { fill: "hsl(var(--muted-foreground))" } };

function binHeading(label: string): string {
  return label === "Land" ? "Lands" : `CMC ${label}`;
}

interface TooltipPayload {
  payload?: CurveBin;
}

function CurveTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const { label, count, cards } = payload[0].payload;
  return (
    <div className="bg-background border border-border rounded-md px-2.5 py-2 text-body shadow-lg max-w-48">
      <div className="font-semibold mb-1">{binHeading(label)} — {count} card{count !== 1 ? "s" : ""}</div>
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

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />;
}

interface Props {
  entries: DeckEntry[];
}

export function ManaCurve({ entries }: Props) {
  // The empty 0 bin is noise on almost every deck; show it only when used.
  const bins = curveBins(entries).filter((b) => !(b.label === "0" && b.count === 0));
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const totalSpells = bins.filter((b) => b.label !== "Land").reduce((s, b) => s + b.count, 0);
  const avgCmc = curveAverage(bins) ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionLabel>
          Mana Curve
        </SectionLabel>
        <span className="text-label text-muted-foreground">
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

type CompareRow = { label: string; a: number; b: number };

function CompareTooltip({
  active,
  payload,
  names,
}: {
  active?: boolean;
  payload?: { payload?: CompareRow }[];
  names: [string, string];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="bg-background border border-border rounded-md px-2.5 py-2 text-body shadow-lg min-w-36">
      <div className="font-semibold mb-1">{binHeading(row.label)}</div>
      {[
        { name: names[0], count: row.a, color: BAR_COLOR },
        { name: names[1], count: row.b, color: BASELINE_COLOR },
      ].map((line, i) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          <Swatch color={line.color} />
          <span className="truncate">{line.name}</span>
          <span className="ml-auto pl-3 font-mono text-foreground">{line.count}</span>
        </div>
      ))}
    </div>
  );
}

type Series = { name: string; bins: CurveBin[]; average: number | null };

/**
 * Two versions' curves side by side, bin for bin. `curveBins` always returns
 * the same bins in the same order, so index i is the same bin in both series.
 */
export function ManaCurveComparison({ series }: { series: [Series, Series] }) {
  const [first, second] = series;
  const rows: CompareRow[] = first.bins
    .map((bin, i) => ({ label: bin.label, a: bin.count, b: second.bins[i]?.count ?? 0 }))
    .filter((row) => !(row.label === "0" && row.a === 0 && row.b === 0));
  const maxCount = Math.max(...rows.flatMap((row) => [row.a, row.b]), 1);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Mana Curve</SectionLabel>
        <span className="flex flex-wrap items-center gap-x-3 text-label text-muted-foreground">
          {[
            { s: first, color: BAR_COLOR },
            { s: second, color: BASELINE_COLOR },
          ].map(({ s, color }, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <Swatch color={color} />
              {s.name} · avg CMC{" "}
              <span className="text-foreground font-medium">{(s.average ?? 0).toFixed(2)}</span>
            </span>
          ))}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={rows} margin={{ top: 16, right: 0, left: -28, bottom: 0 }} barGap={2}>
          <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis
            allowDecimals={false}
            domain={[0, maxCount]}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            content={<CompareTooltip names={[first.name, second.name]} />}
            cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
          />
          <Bar dataKey="a" name={first.name} radius={[3, 3, 0, 0]} maxBarSize={28} fill={BAR_COLOR} fillOpacity={0.85}>
            <LabelList dataKey="a" content={<BarCountLabel />} />
          </Bar>
          <Bar dataKey="b" name={second.name} radius={[3, 3, 0, 0]} maxBarSize={28} fill={BASELINE_COLOR} fillOpacity={0.85}>
            <LabelList dataKey="b" content={<BarCountLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
