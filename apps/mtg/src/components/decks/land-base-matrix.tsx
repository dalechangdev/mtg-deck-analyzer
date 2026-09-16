"use client";

import { Fragment, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { SectionHeader, SectionLabel } from "@/components/ui/section-header";
import { COLOR_LABELS, LAND_GROUP_LABEL, MANA_CHIP } from "@/lib/mtg-styles";
import type { LandBaseAnalysis, LandBaseCell } from "@/lib/land-base";
import type { ManaColumn } from "@/lib/land-capabilities";

interface Props {
  analysis: LandBaseAnalysis;
  /** Names for the drill-down list — the analysis carries only ids. */
  cardsById: ReadonlyMap<string, { name: string; typeLine: string; quantity: number }>;
  onInspect: (cardId: string) => void;
  hasDetail: (cardId: string) => boolean;
}

/** A clicked count: a capability row or the "sources" footer, by column or the row total. */
type Selection = { rowId: string; column: ManaColumn | "total" };

// --- Collapsed state, remembered per browser --------------------------------
// Read through useSyncExternalStore so the server render and the first client
// render agree (expanded), then the stored preference applies. `memory` keeps
// the toggle working when storage is unavailable (private mode, blocked).

const STORAGE_KEY = "land-base-matrix:collapsed";
const listeners = new Set<() => void>();
let memory = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return memory;
  }
}

function writeCollapsed(collapsed: boolean) {
  memory = collapsed;
  try {
    if (collapsed) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — `memory` carries it for this page.
  }
  listeners.forEach((listener) => listener());
}

// ---------------------------------------------------------------------------

/**
 * Rows that can't say anything for this identity. With one colour (or none),
 * "Taps 2+ colors" is always zero; with exactly two, a land that makes both is
 * by definition "any color", so that row repeats "Taps 2+" line for line.
 */
function hiddenRows(identity: string[]): Set<string> {
  if (identity.length < 2) return new Set(["multi"]);
  if (identity.length === 2) return new Set(["any-colour"]);
  return new Set();
}

function columnLabel(column: ManaColumn): string {
  if (column === "any") return "Any color";
  if (column === "C") return "Colorless";
  return COLOR_LABELS[column];
}

function ColumnChip({ column }: { column: ManaColumn }) {
  if (column === "any") {
    return (
      <span className="inline-flex h-5 items-center rounded-full border border-border px-1.5 text-micro font-semibold text-muted-foreground">
        any
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-micro font-bold",
        MANA_CHIP[column]
      )}
    >
      {column}
    </span>
  );
}

function CountCell({
  cell,
  selected,
  onSelect,
  title,
}: {
  /** Undefined = not applicable. */
  cell: LandBaseCell | undefined;
  selected: boolean;
  onSelect: () => void;
  title: string;
}) {
  if (!cell) {
    return (
      <td className="px-1 text-center text-body text-muted-foreground/60" title="Not applicable">
        –
      </td>
    );
  }
  return (
    <td className="px-1 py-px text-center">
      <button
        type="button"
        onClick={onSelect}
        disabled={cell.count === 0}
        aria-pressed={selected}
        title={title}
        className={cn(
          "min-w-7 rounded-md px-1.5 py-0.5 font-mono text-body transition-colors enabled:hover:bg-muted",
          cell.count === 0 && "cursor-default text-muted-foreground/50",
          selected && "bg-info-surface-strong text-info ring-1 ring-info-border enabled:hover:bg-info-surface-strong"
        )}
      >
        {cell.count === 0 ? "·" : cell.count}
      </button>
    </td>
  );
}

/**
 * The land base matrix: the main deck's lands by capability × colour. A land
 * counts once in every colour it can make, so a column reads "sources of X".
 * Click a count to list the lands behind it.
 */
export function LandBaseMatrix({ analysis, cardsById, onInspect, hasDetail }: Props) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [selection, setSelection] = useState<Selection | null>(null);

  const hidden = hiddenRows(analysis.identity);
  const rows = analysis.rows.filter((row) => !hidden.has(row.capabilityId));
  const span = analysis.columns.length + 2;

  const toggle = (next: Selection) =>
    setSelection((prev) =>
      prev?.rowId === next.rowId && prev.column === next.column ? null : next
    );
  const isSelected = (rowId: string, column: Selection["column"]) =>
    selection?.rowId === rowId && selection.column === column;

  // Resolved against the current analysis on every render: promoting or cutting
  // a land can empty the selected cell, and then the list just closes.
  let selected: { title: string; cell: LandBaseCell } | null = null;
  if (selection) {
    const columnTitle = selection.column === "total" ? "all" : columnLabel(selection.column);
    if (selection.rowId === "sources") {
      const cell = selection.column === "total" ? undefined : analysis.sources[selection.column];
      if (cell) selected = { title: `Sources · ${columnTitle}`, cell };
    } else {
      const row = rows.find((r) => r.capabilityId === selection.rowId);
      const cell = row && (selection.column === "total" ? row.total : row.cells[selection.column]);
      if (row && cell) selected = { title: `${row.label} · ${columnTitle}`, cell };
    }
  }

  const nothingNames = analysis.producesNothingIds.map((id) => cardsById.get(id)?.name ?? id);

  return (
    <section className="border-b border-border">
      <SectionHeader className={cn("p-0 gap-0", collapsed && "border-b-0")}>
        <button
          type="button"
          onClick={() => writeCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          className="flex flex-1 min-w-0 items-center gap-1.5 px-4 py-1.5 text-left uppercase tracking-wider hover:bg-border transition-colors"
        >
          <span
            aria-hidden
            className={cn("inline-block w-2.5 text-center transition-transform", !collapsed && "rotate-90")}
          >
            ▸
          </span>
          <span className="truncate">Land base ({analysis.landCount})</span>
        </button>
      </SectionHeader>

      {!collapsed &&
        (analysis.landCount === 0 ? (
          <p className="px-4 py-2 text-label text-muted-foreground">No lands in the main deck yet.</p>
        ) : (
          <div className="px-4 py-2">
            <div className="overflow-x-auto">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="w-44" />
                    <th scope="col" className="px-1 pb-1 text-center">
                      <SectionLabel size="micro">Total</SectionLabel>
                    </th>
                    {analysis.columns.map((column) => (
                      <th key={column} scope="col" title={columnLabel(column)} className="px-1 pb-1 text-center">
                        <ColumnChip column={column} />
                        <span className="sr-only">{columnLabel(column)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, i) => (
                    <Fragment key={row.capabilityId}>
                      {row.group !== rows[i - 1]?.group && (
                        <tr>
                          <th colSpan={span} scope="colgroup" className="pt-2 pb-0.5 text-left">
                            <SectionLabel size="micro">{LAND_GROUP_LABEL[row.group]}</SectionLabel>
                          </th>
                        </tr>
                      )}
                      <tr className="hover:bg-muted/30">
                        <th
                          scope="row"
                          title={row.description}
                          className="w-44 pr-3 text-left text-body font-normal"
                        >
                          {row.label}
                        </th>
                        <CountCell
                          cell={row.total}
                          selected={isSelected(row.capabilityId, "total")}
                          onSelect={() => toggle({ rowId: row.capabilityId, column: "total" })}
                          title={`${row.label}: every land`}
                        />
                        {analysis.columns.map((column) => (
                          <CountCell
                            key={column}
                            cell={row.cells[column]}
                            selected={isSelected(row.capabilityId, column)}
                            onSelect={() => toggle({ rowId: row.capabilityId, column })}
                            title={`${row.label} · ${columnLabel(column)}`}
                          />
                        ))}
                      </tr>
                    </Fragment>
                  ))}
                </tbody>

                <tfoot>
                  <tr className="border-t border-border">
                    <th
                      scope="row"
                      title="Every land that can pay for each column"
                      className="w-44 pt-1 pr-3 text-left text-body font-medium"
                    >
                      Sources
                    </th>
                    <td
                      title="Lands in the main deck"
                      className="px-1 pt-1 text-center font-mono text-body text-muted-foreground"
                    >
                      {analysis.landCount}
                    </td>
                    {analysis.columns.map((column) => (
                      <CountCell
                        key={column}
                        cell={analysis.sources[column]}
                        selected={isSelected("sources", column)}
                        onSelect={() => toggle({ rowId: "sources", column })}
                        title={`Sources of ${columnLabel(column)}`}
                      />
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>

            {selected && selected.cell.count > 0 && (
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
                <ul className="mt-1 grid grid-cols-2 gap-x-4 lg:grid-cols-3">
                  {selected.cell.cardIds.map((cardId) => {
                    const card = cardsById.get(cardId);
                    return (
                      <li key={cardId} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onInspect(cardId)}
                          disabled={!hasDetail(cardId)}
                          title={card?.typeLine ?? "View card details"}
                          className="flex w-full min-w-0 items-baseline gap-1 py-0.5 text-left text-label enabled:hover:underline disabled:cursor-default"
                        >
                          <span className="truncate">{card?.name ?? cardId}</span>
                          {card && card.quantity > 1 && (
                            <span className="flex-shrink-0 font-mono text-muted-foreground">×{card.quantity}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {nothingNames.length > 0 && (
              <p
                className="mt-2 text-label text-warning"
                title="Detected from Scryfall's produced mana and the oracle text. A land that should count may need its card data re-synced."
              >
                {nothingNames.length === 1 ? "1 land makes" : `${nothingNames.length} lands make`} no mana
                that counts toward a color: {nothingNames.join(", ")}
              </p>
            )}
          </div>
        ))}
    </section>
  );
}
