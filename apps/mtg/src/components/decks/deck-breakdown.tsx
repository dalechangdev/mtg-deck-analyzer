"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { DeckEntry } from "@/lib/commander";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TagGraph } from "./tag-graph";
import { buildTagGraph } from "@/lib/deck-tag-graph";
import { SectionHeader, SectionLabel } from "@/components/ui/section-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL,
  DIMENSION_LABEL,
  MULTI_VALUED,
  ROW_ONLY,
  breakdownDeck,
  cellKey,
  groupByType,
  type BreakdownCell,
  type BreakdownDimension,
  type RoleContext,
} from "@/lib/deck-breakdown";

interface Props {
  entries: DeckEntry[];
  roleContext: RoleContext;
  /** Hidden from the graph unless "Trivia tags" is on. */
  triviaTags: string[];
  onInspect: (cardId: string) => void;
  hasDetail: (cardId: string) => boolean;
}

/** A clicked count; `ALL` on either axis means that axis's total. */
type Selection = { row: string; column: string };

const DIMENSIONS: BreakdownDimension[] = ["type", "cmc", "color", "role", "tag", "none"];
const COLUMN_DIMENSIONS = DIMENSIONS.filter((d) => !ROW_ONLY.has(d));

/** Tag rows shown before "Show all"; a 100-card deck carries several hundred. */
const TAG_ROW_LIMIT = 25;

type View = "table" | "graph";

/** Past ~40 hubs the graph stops separating into readable clusters. */
const GRAPH_MAX_TAGS = 40;
const GRAPH_MIN_CARDS = [2, 3, 4, 5, 6, 8, 10];

function DimensionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: BreakdownDimension;
  options: BreakdownDimension[];
  onChange: (next: BreakdownDimension) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <SectionLabel size="micro">{label}</SectionLabel>
      <Select value={value} onValueChange={(v) => onChange(v as BreakdownDimension)}>
        <SelectTrigger size="sm" className="text-body">
          <SelectValue>{(v) => DIMENSION_LABEL[v as BreakdownDimension]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((d) => (
            <SelectItem key={d} value={d}>
              {DIMENSION_LABEL[d]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function CountCell({
  cell,
  max,
  selected,
  onSelect,
  title,
  strong,
}: {
  cell: BreakdownCell | undefined;
  /** The largest interior cell, for the heat shading. */
  max?: number;
  selected: boolean;
  onSelect: () => void;
  title: string;
  strong?: boolean;
}) {
  const count = cell?.count ?? 0;
  // Shade interior cells by share of the busiest one, so clusters read at a
  // glance. Square root, so 37 lands don't wash every spell cell out to nothing.
  const heat = max && count > 0 && !selected ? Math.round(8 + Math.sqrt(count / max) * 32) : 0;
  return (
    <td className="px-0.5 py-px text-center whitespace-nowrap">
      <button
        type="button"
        onClick={onSelect}
        disabled={count === 0}
        aria-pressed={selected}
        title={title}
        style={heat ? { backgroundColor: `color-mix(in oklch, var(--info) ${heat}%, transparent)` } : undefined}
        className={cn(
          "min-w-8 rounded-md px-1.5 py-0.5 font-mono text-body transition-colors enabled:hover:ring-1 enabled:hover:ring-border",
          strong && "font-medium",
          count === 0 && "cursor-default text-muted-foreground/50",
          selected && "bg-info-surface-strong text-info ring-1 ring-info-border"
        )}
      >
        {count === 0 ? "·" : count}
      </button>
    </td>
  );
}

/**
 * The main deck cross-tabulated along two chosen dimensions — type × mana value
 * by default. Click any count, row or column total to list the cards behind it,
 * grouped by type the way Moxfield lays out a deck.
 */
export function DeckBreakdown({ entries, roleContext, triviaTags, onInspect, hasDetail }: Props) {
  const [rowDimension, setRowDimension] = useState<BreakdownDimension>("type");
  const [columnDimension, setColumnDimension] = useState<BreakdownDimension>("cmc");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  const [view, setView] = useState<View>("table");
  const [graphMinCards, setGraphMinCards] = useState(3);
  const [showTrivia, setShowTrivia] = useState(false);

  const breakdown = useMemo(
    () => breakdownDeck(entries, rowDimension, columnDimension, roleContext),
    [entries, rowDimension, columnDimension, roleContext]
  );
  const cardsById = useMemo(() => new Map(entries.map((e) => [e.cardId, e])), [entries]);

  // Graph mode reads tags whatever the table's dimensions are; its tag
  // selection resolves against this rather than the table's breakdown.
  const graphMode = view === "graph";
  const tagBreakdown = useMemo(
    () => (graphMode ? breakdownDeck(entries, "tag", "none", roleContext) : null),
    [graphMode, entries, roleContext]
  );
  const graph = useMemo(
    () =>
      graphMode
        ? buildTagGraph(entries, {
            minCards: graphMinCards,
            maxTags: GRAPH_MAX_TAGS,
            filter: tagFilter,
            exclude: showTrivia ? undefined : new Set(triviaTags),
          })
        : null,
    [graphMode, entries, graphMinCards, tagFilter, showTrivia, triviaTags]
  );

  const changeView = (next: View) => {
    setView(next);
    setSelection(null);
  };

  const changeRows = (next: BreakdownDimension) => {
    setRowDimension(next);
    setSelection(null);
  };
  const changeColumns = (next: BreakdownDimension) => {
    setColumnDimension(next);
    setSelection(null);
  };
  const swap = () => {
    setRowDimension(columnDimension);
    setColumnDimension(rowDimension);
    setSelection((s) => s && { row: s.column, column: s.row });
  };

  const showColumns = columnDimension !== "none";
  const multiValued = [rowDimension, columnDimension].filter((d) => MULTI_VALUED.has(d));
  const canSwap = !ROW_ONLY.has(rowDimension);

  // Tag rows are searchable and capped; the selection survives either, since
  // it's resolved against the full breakdown below.
  const tagRows = rowDimension === "tag";
  const needle = tagFilter.trim().toLowerCase();
  const matchingRows =
    tagRows && needle
      ? breakdown.rows.filter((r) => r.label.toLowerCase().includes(needle))
      : breakdown.rows;
  const visibleRows =
    tagRows && !showAllTags ? matchingRows.slice(0, TAG_ROW_LIMIT) : matchingRows;
  const max = Math.max(0, ...[...breakdown.cells.values()].map((c) => c.count));

  const toggle = (next: Selection) =>
    setSelection((prev) => (prev?.row === next.row && prev.column === next.column ? null : next));
  const isSelected = (row: string, column: string) =>
    selection?.row === row && selection.column === column;

  const labelOf = (buckets: { key: string; label: string }[], key: string) =>
    buckets.find((b) => b.key === key)?.label ?? key;

  // Re-resolved every render: a promotion or override can empty the selection.
  let selected: { title: string; cell: BreakdownCell } | null = null;
  if (selection && tagBreakdown) {
    const cell = tagBreakdown.rowTotals.get(selection.row);
    if (cell && cell.count > 0) selected = { title: selection.row, cell };
  } else if (selection) {
    const { row, column } = selection;
    const cell =
      row === ALL && column === ALL
        ? breakdown.total
        : row === ALL
          ? breakdown.columnTotals.get(column)
          : column === ALL
            ? breakdown.rowTotals.get(row)
            : breakdown.cells.get(cellKey(row, column));
    if (cell && cell.count > 0) {
      const parts = [
        row !== ALL && labelOf(breakdown.rows, row),
        column !== ALL && showColumns && `${DIMENSION_LABEL[columnDimension]} ${labelOf(breakdown.columns, column)}`,
      ].filter(Boolean);
      selected = { title: parts.length > 0 ? parts.join(" · ") : "Main deck", cell };
    }
  }

  const selectedCards = selected
    ? selected.cell.cardIds.flatMap((id) => cardsById.get(id) ?? [])
    : [];

  // Shared by the table's tag rows and the graph, so a filter survives a switch.
  const filterInput = (
    <Input
      type="search"
      value={tagFilter}
      onChange={(e) => setTagFilter(e.target.value)}
      placeholder="Filter tags"
      aria-label="Filter tags"
      className="h-7 w-44 text-body"
    />
  );

  return (
    <section className="border-b border-border">
      <SectionHeader className="justify-between gap-3 px-4">
        <span>Breakdown ({breakdown.total.count})</span>
        <ToggleGroup
          value={[view]}
          onValueChange={(value) => {
            // Base UI allows an empty selection; keep the last choice.
            const next = value[0] as View | undefined;
            if (next) changeView(next);
          }}
          multiple={false}
          variant="outline"
          size="sm"
          spacing={0}
        >
          <ToggleGroupItem value="table" className="h-6 min-w-0 px-2 text-micro">
            Table
          </ToggleGroupItem>
          <ToggleGroupItem value="graph" className="h-6 min-w-0 px-2 text-micro">
            Tag graph
          </ToggleGroupItem>
        </ToggleGroup>
      </SectionHeader>

      <div className="px-4 py-2">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          {graphMode ? (
            <>
              <label className="flex items-center gap-1.5">
                <SectionLabel size="micro">Tags on at least</SectionLabel>
                <Select value={String(graphMinCards)} onValueChange={(v) => setGraphMinCards(Number(v))}>
                  <SelectTrigger size="sm" className="text-body">
                    <SelectValue>{(v) => `${v} cards`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {GRAPH_MIN_CARDS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} cards
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {filterInput}
              <label
                className="flex items-center gap-1.5 text-label text-muted-foreground"
                title="Tags about the card itself rather than its play: names, cycles, vanilla-ness"
              >
                <input
                  type="checkbox"
                  checked={showTrivia}
                  onChange={(e) => setShowTrivia(e.target.checked)}
                  className="accent-[var(--info)]"
                />
                Trivia tags
              </label>
            </>
          ) : (
            <>
              <DimensionSelect label="Rows" value={rowDimension} options={DIMENSIONS} onChange={changeRows} />
              <button
                type="button"
                onClick={swap}
                disabled={!canSwap}
                title={canSwap ? "Swap rows and columns" : `${DIMENSION_LABEL[rowDimension]} can only be rows`}
                className="rounded-md border border-border px-1.5 py-0.5 text-label text-muted-foreground enabled:hover:text-foreground enabled:hover:border-input disabled:opacity-40"
              >
                ⇄
              </button>
              <DimensionSelect
                label="Columns"
                value={columnDimension}
                options={COLUMN_DIMENSIONS}
                onChange={changeColumns}
              />
              {tagRows && filterInput}
            </>
          )}
        </div>

        {graphMode && graph ? (
          breakdown.total.count === 0 ? (
            <p className="text-label text-muted-foreground">No cards in the main deck yet.</p>
          ) : graph.nodes.length === 0 ? (
            <p className="text-label text-muted-foreground">
              {graph.totalTags === 0
                ? "None of these cards has a Scryfall tag."
                : "No tag matches the filter and threshold."}
            </p>
          ) : (
            <>
              <TagGraph
                graph={graph}
                selectedTag={selection?.row ?? null}
                onSelectTag={(tag) => toggle({ row: tag, column: ALL })}
                onInspect={(cardId) => hasDetail(cardId) && onInspect(cardId)}
              />
              <p className="mt-1 text-label text-muted-foreground">
                {graph.nodes.filter((n) => n.kind === "tag").length} of {graph.totalTags} tags
                {graph.hiddenCards > 0 && ` · ${graph.hiddenCards} cards carry none of them`}. Click a tag to
                list its cards, a card to open it. Drag to move or pan; ⌘/Ctrl + scroll to zoom.
              </p>
            </>
          )
        ) : (
          <>
            {breakdown.total.count === 0 ? (
              <p className="text-label text-muted-foreground">No cards in the main deck yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="border-collapse">
                  {showColumns && (
                    <thead>
                      <tr>
                        <th className="w-44" />
                        {breakdown.columns.map((column) => (
                          <th key={column.key} scope="col" className="px-0.5 pb-1 text-center">
                            <SectionLabel size="micro" className="whitespace-nowrap">
                              {column.label}
                            </SectionLabel>
                          </th>
                        ))}
                        <th scope="col" className="px-0.5 pb-1 pl-2 text-center">
                          <SectionLabel size="micro">Total</SectionLabel>
                        </th>
                      </tr>
                    </thead>
                  )}

                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.key} className="hover:bg-muted/30">
                        <th
                          scope="row"
                          title={tagRows ? row.label : undefined}
                          className="w-44 max-w-56 truncate pr-3 text-left text-body font-normal whitespace-nowrap"
                        >
                          {row.label}
                        </th>
                        {showColumns &&
                          breakdown.columns.map((column) => (
                            <CountCell
                              key={column.key}
                              cell={breakdown.cells.get(cellKey(row.key, column.key))}
                              max={max}
                              selected={isSelected(row.key, column.key)}
                              onSelect={() => toggle({ row: row.key, column: column.key })}
                              title={`${row.label} · ${DIMENSION_LABEL[columnDimension]} ${column.label}`}
                            />
                          ))}
                        <CountCell
                          cell={breakdown.rowTotals.get(row.key)}
                          selected={isSelected(row.key, ALL)}
                          onSelect={() => toggle({ row: row.key, column: ALL })}
                          title={`${row.label}: all`}
                          strong
                        />
                      </tr>
                    ))}
                  </tbody>

                  <tfoot>
                    <tr className="border-t border-border">
                      <th scope="row" className="w-44 pt-1 pr-3 text-left text-body font-medium">
                        Total
                      </th>
                      {showColumns &&
                        breakdown.columns.map((column) => (
                          <CountCell
                            key={column.key}
                            cell={breakdown.columnTotals.get(column.key)}
                            selected={isSelected(ALL, column.key)}
                            onSelect={() => toggle({ row: ALL, column: column.key })}
                            title={`${DIMENSION_LABEL[columnDimension]} ${column.label}: all`}
                            strong
                          />
                        ))}
                      <CountCell
                        cell={breakdown.total}
                        selected={isSelected(ALL, ALL)}
                        onSelect={() => toggle({ row: ALL, column: ALL })}
                        title="Every card in the main deck"
                        strong
                      />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {tagRows && breakdown.total.count > 0 && (
              <div className="mt-1 flex items-center gap-2 text-label text-muted-foreground">
                {matchingRows.length === 0 ? (
                  <span>No tags match “{tagFilter.trim()}”.</span>
                ) : (
                  <span>
                    {visibleRows.length} of {matchingRows.length}
                    {needle ? " matching" : ""} tags, from Scryfall Tagger.
                  </span>
                )}
                {matchingRows.length > TAG_ROW_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllTags((v) => !v)}
                    className="underline hover:text-foreground"
                  >
                    {showAllTags ? `Show top ${TAG_ROW_LIMIT}` : "Show all"}
                  </button>
                )}
              </div>
            )}

            {multiValued.length > 0 && breakdown.total.count > 0 && (
              <p className="mt-1 text-label text-muted-foreground">
                {multiValued.includes("tag")
                  ? "A card can carry many tags — “draw” also counts under “card advantage” — so tag counts overlap."
                  : "A card can fill several roles, so role counts overlap."}{" "}
                Totals count each card once.
              </p>
            )}
          </>
        )}

        {selected && (
          <div className="mt-2 rounded-md border border-border bg-muted/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <SectionLabel size="micro">{selected.title}</SectionLabel>
              <span className="font-mono text-label text-muted-foreground">{selected.cell.count}</span>
              <button
                type="button"
                onClick={() => setSelection(null)}
                title="Close"
                className="ml-auto flex h-4 w-4 items-center justify-center rounded-md text-label text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ×
              </button>
            </div>
            <div className="mt-1 space-y-2">
              {groupByType(selectedCards).map((group) => (
                <div key={group.category}>
                  <SectionLabel size="micro" className="font-normal">
                    {group.category} ({group.cards.reduce((sum, c) => sum + c.quantity, 0)})
                  </SectionLabel>
                  <ul className="grid grid-cols-2 gap-x-6 lg:grid-cols-3">
                    {group.cards.map((card) => (
                      <li key={card.cardId} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onInspect(card.cardId)}
                          disabled={!hasDetail(card.cardId)}
                          title={card.typeLine}
                          className="flex w-full min-w-0 items-baseline gap-1 py-0.5 text-left text-label enabled:hover:underline disabled:cursor-default"
                        >
                          {card.quantity > 1 && (
                            <span className="flex-shrink-0 font-mono text-muted-foreground">{card.quantity}</span>
                          )}
                          <span className="truncate">{card.name}</span>
                          <span className="ml-auto flex-shrink-0 font-mono text-muted-foreground">
                            {card.manaCost ?? ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
