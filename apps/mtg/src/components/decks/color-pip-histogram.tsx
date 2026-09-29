"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionLabel } from "@/components/ui/section-header";
import { COLOR_LABELS, MANA_SVG } from "@/lib/mtg-styles";
import { analyzeCostPips, type PipBin, type PipCard } from "@/lib/mana-pips";

const COLOR_NAME: Record<string, string> = { ...COLOR_LABELS, C: "Colorless" };

/**
 * The white and black mana fills nearly vanish on the light and dark surfaces
 * (1.03:1 and 1.12:1). A thin neutral outline on every bar keeps each one's
 * extent visible in both themes; the pip under it carries identity.
 */
const BAR_OUTLINE = { stroke: "var(--foreground)", strokeOpacity: 0.3, strokeWidth: 1 };

type Row = PipBin & { share: number };

function PipTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const color = payload?.value;
  if (!color) return null;
  const svg = MANA_SVG[color];
  return (
    <g transform={`translate(${x ?? 0},${(y ?? 0) + 9})`}>
      <circle r={8} fill={svg.fill} stroke={svg.edge} strokeWidth={1.5} />
      <text textAnchor="middle" dy="0.35em" fontSize={9} fontWeight={700} fill={svg.ink}>
        {color}
      </text>
    </g>
  );
}

function CountLabel({ x, y, width, value }: { x?: number; y?: number; width?: number; value?: number }) {
  if (!value) return null;
  return (
    <text
      x={(x ?? 0) + (width ?? 0) / 2}
      y={(y ?? 0) - 4}
      textAnchor="middle"
      fontSize={10}
      fill="var(--foreground)"
    >
      {value}
    </text>
  );
}

function PipTooltip({ active, payload }: { active?: boolean; payload?: { payload?: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="bg-background border border-border rounded-md px-2.5 py-2 text-body shadow-lg max-w-52">
      <div className="font-semibold">
        {COLOR_NAME[row.color]} — {row.pips} pip{row.pips === 1 ? "" : "s"}
      </div>
      <div className="text-muted-foreground mb-1">
        {Math.round(row.share * 100)}% of pips · {row.cards} card{row.cards === 1 ? "" : "s"}
      </div>
      <ul className="space-y-0.5 text-muted-foreground">
        {row.cardNames.slice(0, 8).map((name) => (
          <li key={name} className="truncate">{name}</li>
        ))}
        {row.cardNames.length > 8 && (
          <li className="text-muted-foreground/60">+{row.cardNames.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}

interface Props {
  /** Any card list; lands and non-main rows are skipped (see analyzeCostPips). */
  cards: PipCard[];
  /**
   * Colours to show even at zero — usually the commander's identity, so a
   * colour the deck is allowed but barely uses reads as a visible gap. Other
   * colours appear only when something actually costs them.
   */
  identity?: string[];
  title?: string;
  height?: number;
}

/**
 * Histogram of coloured mana symbols in the costs of nonland cards: how hard
 * the spells lean on each colour, which is what the mana base has to answer.
 * Self-contained — pass it a card list and it does its own counting.
 */
export function ColorPipHistogram({ cards, identity = [], title = "Cost colours", height = 140 }: Props) {
  const analysis = useMemo(() => analyzeCostPips(cards), [cards]);

  const rows: Row[] = analysis.bins
    .filter((bin) => bin.pips > 0 || identity.includes(bin.color))
    .map((bin) => ({ ...bin, share: analysis.totalPips ? bin.pips / analysis.totalPips : 0 }));
  const maxPips = Math.max(...rows.map((r) => r.pips), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionLabel>{title}</SectionLabel>
        <span className="text-label text-muted-foreground">
          <span className="text-foreground font-medium">{analysis.totalPips}</span> pips
          <span className="mx-1.5 opacity-40">·</span>
          {analysis.spellCount} nonland card{analysis.spellCount === 1 ? "" : "s"}
        </span>
      </div>

      {analysis.totalPips === 0 ? (
        <p className="text-label text-muted-foreground py-4">No coloured costs yet.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={rows} margin={{ top: 16, right: 0, left: 0, bottom: 4 }}>
              <XAxis dataKey="color" tick={<PipTick />} axisLine={false} tickLine={false} interval={0} height={24} />
              {/* Hidden: every bar carries its count, so the axis only adds ink. */}
              <YAxis hide domain={[0, maxPips]} />
              <Tooltip
                content={<PipTooltip />}
                // A light band, so it can't swallow the near-black B bar.
                cursor={{ fill: "var(--muted)", fillOpacity: 0.25 }}
                // Beside the pointer, not on top of the bar it describes.
                offset={24}
              />
              <Bar dataKey="pips" radius={[4, 4, 0, 0]} maxBarSize={36} {...BAR_OUTLINE}>
                {rows.map((row) => (
                  <Cell key={row.color} fill={MANA_SVG[row.color].fill} />
                ))}
                <LabelList dataKey="pips" content={<CountLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <table className="sr-only">
            <caption>{title}: coloured mana symbols in nonland card costs</caption>
            <thead>
              <tr><th>Colour</th><th>Pips</th><th>Share</th><th>Cards</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.color}>
                  <td>{COLOR_NAME[row.color]}</td>
                  <td>{row.pips}</td>
                  <td>{Math.round(row.share * 100)}%</td>
                  <td>{row.cards}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
