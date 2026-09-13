"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";
import { CATEGORY_ORDER } from "@/lib/commander";
import { REQUIREMENT_STATUS_STYLE } from "@/lib/mtg-styles";
import { compareUrl, deckPageUrl, gamesPageUrl, type VersionSummary } from "@/lib/deck-api";
import {
  winRate,
  type ComparedVersion,
  type DiffCard,
  type QuantityChange,
  type VersionComparison,
} from "@/lib/deck-version";
import { ManaCurveComparison } from "./mana-curve";

interface Props {
  deckId: string;
  deckName: string;
  comparison: VersionComparison;
  templates: { id: string; name: string; isBuiltIn: boolean }[];
}

/** a − b, signed; an em dash when they're equal. */
function delta(a: number, b: number, digits = 0): string {
  const diff = a - b;
  if (Math.abs(diff) < 0.5 * 10 ** -digits) return "—";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(digits)}`;
}

function percent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function recordText({ games, wins, losses, draws }: VersionSummary["record"]): string {
  return games === 0 ? "none" : `${wins}W ${losses}L ${draws}D`;
}

const requirementsMet = (v: ComparedVersion) =>
  v.analysis.requirements.filter((r) => r.status === "met").length;

function VersionPicker({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: string;
  versions: VersionSummary[];
  onChange: (versionId: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as string)}>
      <SelectTrigger size="sm" aria-label={label} className="text-body">
        <SelectValue>{(id) => versions.find((v) => v.id === id)?.name ?? id}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.name}
            {v.isCurrent ? " (current)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CardChanges({
  title,
  total,
  tone,
  children,
  empty,
}: {
  title: string;
  total: string;
  tone: string;
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card min-w-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <span className="text-body font-medium truncate">{title}</span>
        <span className={cn("text-label font-mono flex-shrink-0", tone)}>{total}</span>
      </div>
      {empty ? (
        <p className="px-3 py-3 text-label text-muted-foreground">None</p>
      ) : (
        <ul className="px-3 py-2 space-y-0.5">{children}</ul>
      )}
    </div>
  );
}

function CardRow({ card, sign, tone }: { card: DiffCard; sign: string; tone: string }) {
  return (
    <li className="flex items-baseline gap-2 text-body min-w-0">
      <span className={cn("font-mono text-label w-7 flex-shrink-0", tone)}>
        {sign}
        {card.quantity}
      </span>
      <span className="truncate">{card.name}</span>
      {card.isCommander && <span className="text-label text-muted-foreground">commander</span>}
    </li>
  );
}

function QuantityRow({ change }: { change: QuantityChange }) {
  return (
    <li className="flex items-baseline gap-2 text-body min-w-0">
      <span className="truncate flex-1">{change.name}</span>
      <span className="font-mono text-label text-muted-foreground flex-shrink-0">
        {change.from} → {change.to}
      </span>
    </li>
  );
}

export function VersionCompare({ deckId, deckName, comparison, templates }: Props) {
  const router = useRouter();
  const { versions, a, b, diff } = comparison;
  const templateId = a.analysis.templateId;

  function go(next: { a?: string; b?: string; templateId?: string }) {
    router.push(
      compareUrl(deckId, next.a ?? a.summary.id, next.b ?? b.summary.id, next.templateId ?? templateId)
    );
  }

  const aRate = winRate(a.summary.record);
  const bRate = winRate(b.summary.record);

  const rows: { label: string; a: string; b: string; delta: string }[] = [
    {
      label: "Main deck",
      a: `${a.stats.mainCount} / 100`,
      b: `${b.stats.mainCount} / 100`,
      delta: delta(a.stats.mainCount, b.stats.mainCount),
    },
    { label: "Lands", a: `${a.stats.lands}`, b: `${b.stats.lands}`, delta: delta(a.stats.lands, b.stats.lands) },
    {
      label: "Average mana value",
      a: a.stats.averageCmc?.toFixed(2) ?? "—",
      b: b.stats.averageCmc?.toFixed(2) ?? "—",
      delta:
        a.stats.averageCmc !== null && b.stats.averageCmc !== null
          ? delta(a.stats.averageCmc, b.stats.averageCmc, 2)
          : "—",
    },
    { label: "Ramp", a: `${a.stats.ramp}`, b: `${b.stats.ramp}`, delta: delta(a.stats.ramp, b.stats.ramp) },
    // Lands already have a row, counted the way the curve counts them.
    ...CATEGORY_ORDER.filter(
      (category) => category !== "Lands" && (a.stats.categories[category] || b.stats.categories[category])
    ).map((category) => ({
      label: category,
      a: `${a.stats.categories[category]}`,
      b: `${b.stats.categories[category]}`,
      delta: delta(a.stats.categories[category], b.stats.categories[category]),
    })),
    {
      label: "Requirements met",
      a: `${requirementsMet(a)} / ${a.analysis.requirements.length}`,
      b: `${requirementsMet(b)} / ${b.analysis.requirements.length}`,
      delta: delta(requirementsMet(a), requirementsMet(b)),
    },
    {
      label: "Games",
      a: recordText(a.summary.record),
      b: recordText(b.summary.record),
      delta: delta(a.summary.record.games, b.summary.record.games),
    },
    {
      label: "Win rate",
      a: percent(aRate),
      b: percent(bRate),
      delta: aRate !== null && bRate !== null ? `${delta(aRate * 100, bRate * 100)} pts` : "—",
    },
  ];

  const bRequirements = new Map(b.analysis.requirements.map((r) => [r.roleId, r]));
  const quantity = (cards: DiffCard[]) => cards.reduce((sum, c) => sum + c.quantity, 0);

  const versionHeading = (v: ComparedVersion) => (
    <th className="text-right font-medium px-3 py-2">
      <span className="block text-foreground">{v.summary.name}</span>
      <span className="flex justify-end gap-2 text-label font-normal">
        <Link href={deckPageUrl(deckId, v.summary.id)} className="hover:text-foreground">
          builder
        </Link>
        <Link href={gamesPageUrl(deckId, v.summary.id)} className="hover:text-foreground">
          games
        </Link>
      </span>
    </th>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 mr-2">
          <h1 className="text-title font-semibold truncate">{deckName}</h1>
          <p className="text-body text-muted-foreground">Compare versions</p>
        </div>
        <VersionPicker label="Version" value={a.summary.id} versions={versions} onChange={(id) => go({ a: id })} />
        <span className="text-body text-muted-foreground">against</span>
        <VersionPicker label="Baseline" value={b.summary.id} versions={versions} onChange={(id) => go({ b: id })} />
        <Button variant="outline" size="xs" onClick={() => go({ a: b.summary.id, b: a.summary.id })}>
          Swap
        </Button>
        <Select value={templateId} onValueChange={(next) => go({ templateId: next as string })}>
          <SelectTrigger size="sm" aria-label="Template" className="text-body text-muted-foreground">
            <SelectValue>
              {(id) => templates.find((t) => t.id === id)?.name ?? a.analysis.templateName}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.isBuiltIn ? " (built-in)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link
          href={deckPageUrl(deckId, a.summary.id, "/versions")}
          className="ml-auto text-body text-muted-foreground hover:text-foreground"
        >
          All versions
        </Link>
      </div>

      {a.summary.id === b.summary.id && (
        <p className="text-body text-warning">Both sides are the same version — pick a different baseline.</p>
      )}

      {/* At a glance */}
      <section className="space-y-2">
        <SectionLabel>At a glance</SectionLabel>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-body">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2" />
                {versionHeading(a)}
                {versionHeading(b)}
                <th className="text-right font-medium px-3 py-2 w-24">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-border/60">
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{row.label}</td>
                  <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">{row.a}</td>
                  <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">{row.b}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-muted-foreground whitespace-nowrap">
                    {row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Card changes */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <SectionLabel>Card changes</SectionLabel>
          <span className="text-label text-muted-foreground">
            {diff.unchangedCount} card{diff.unchangedCount === 1 ? "" : "s"} in both
          </span>
        </div>
        {diff.commander.from !== diff.commander.to && (
          <p className="text-body">
            Commander: <span className="text-muted-foreground">{diff.commander.from ?? "none"}</span> in{" "}
            {b.summary.name} → <span className="font-medium">{diff.commander.to ?? "none"}</span> in{" "}
            {a.summary.name}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <CardChanges
            title={`In ${a.summary.name}, not ${b.summary.name}`}
            total={`+${quantity(diff.added)}`}
            tone="text-success"
            empty={diff.added.length === 0}
          >
            {diff.added.map((card) => (
              <CardRow key={card.cardId} card={card} sign="+" tone="text-success" />
            ))}
          </CardChanges>
          <CardChanges
            title={`In ${b.summary.name}, not ${a.summary.name}`}
            total={`−${quantity(diff.removed)}`}
            tone="text-danger"
            empty={diff.removed.length === 0}
          >
            {diff.removed.map((card) => (
              <CardRow key={card.cardId} card={card} sign="−" tone="text-danger" />
            ))}
          </CardChanges>
          <CardChanges
            title={`Count changed (${b.summary.name} → ${a.summary.name})`}
            total={`${diff.changedQuantity.length}`}
            tone="text-muted-foreground"
            empty={diff.changedQuantity.length === 0}
          >
            {diff.changedQuantity.map((change) => (
              <QuantityRow key={change.cardId} change={change} />
            ))}
          </CardChanges>
        </div>
      </section>

      {/* Curves */}
      <section>
        <ManaCurveComparison
          series={[
            { name: a.summary.name, bins: a.stats.curve, average: a.stats.averageCmc },
            { name: b.summary.name, bins: b.stats.curve, average: b.stats.averageCmc },
          ]}
        />
      </section>

      {/* Template scorecard */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <SectionLabel>{a.analysis.templateName}</SectionLabel>
          <span className="flex gap-3 text-label">
            <span className={REQUIREMENT_STATUS_STYLE.under.text}>under</span>
            <span className={REQUIREMENT_STATUS_STYLE.met.text}>met</span>
            <span className={REQUIREMENT_STATUS_STYLE.over.text}>over</span>
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-body">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Role</th>
                <th className="text-right font-medium px-3 py-2">Target</th>
                <th className="text-right font-medium px-3 py-2">{a.summary.name}</th>
                <th className="text-right font-medium px-3 py-2">{b.summary.name}</th>
                <th className="text-right font-medium px-3 py-2 w-24">Difference</th>
              </tr>
            </thead>
            <tbody>
              {a.analysis.requirements.map((req) => {
                const other = bRequirements.get(req.roleId);
                return (
                  <tr key={req.roleId} className="border-t border-border/60">
                    <td className="px-3 py-1.5 whitespace-nowrap">{req.roleName}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{req.targetCount}</td>
                    <td className={cn("px-3 py-1.5 text-right font-mono", REQUIREMENT_STATUS_STYLE[req.status].text)}>
                      {req.actual}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono",
                        other && REQUIREMENT_STATUS_STYLE[other.status].text
                      )}
                    >
                      {other?.actual ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                      {other ? delta(req.actual, other.actual) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
