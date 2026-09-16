/**
 * The land base matrix (docs/plans/land-base-matrix.md): a deck's lands counted
 * by capability × colour.
 *
 * Pure, like `evaluateTemplate`: the analysis page recomputes it in the browser
 * whenever a card changes slot, and the analysis route returns the same result.
 */

import type { DeckEntry } from "@/lib/commander";
import { COLOR_ORDER } from "@/lib/mtg-styles";
import {
  isFetch,
  isLand,
  LAND_CAPABILITIES,
  landColours,
  type CapabilityGroup,
  type ManaColumn,
} from "@/lib/land-capabilities";

/** Copies, weighted by quantity, and the cards behind them — what a click lists. */
export type LandBaseCell = { count: number; cardIds: string[] };

export type LandBaseRow = {
  capabilityId: string;
  group: CapabilityGroup;
  label: string;
  description: string;
  /** Each land once, however many columns it counts in. */
  total: LandBaseCell;
  /** Absent = not applicable (renders "–"); present with count 0 = none. */
  cells: Partial<Record<ManaColumn, LandBaseCell>>;
};

export type LandBaseAnalysis = {
  /** The commander's colour identity, in WUBRG order. */
  identity: string[];
  /** Identity colours, then "C", then "any". */
  columns: ManaColumn[];
  /** One per LAND_CAPABILITIES entry, in that order — rows at zero included. */
  rows: LandBaseRow[];
  /** The footer: every land that counts toward each column. */
  sources: Partial<Record<ManaColumn, LandBaseCell>>;
  landCount: number;
  /** Lands with no colour we can see and no fetch: a review queue, or a sync gap. */
  producesNothingIds: string[];
};

// Cells that can never be non-zero, so the matrix shows "–" rather than "·".
const NOT_APPLICABLE: Partial<Record<string, ReadonlySet<ManaColumn>>> = {
  basic: new Set<ManaColumn>(["any"]),
};

function emptyCells(
  columns: ManaColumn[],
  capabilityId?: string
): Partial<Record<ManaColumn, LandBaseCell>> {
  const cells: Partial<Record<ManaColumn, LandBaseCell>> = {};
  for (const column of columns) {
    if (capabilityId && NOT_APPLICABLE[capabilityId]?.has(column)) continue;
    cells[column] = { count: 0, cardIds: [] };
  }
  return cells;
}

function add(cell: LandBaseCell, land: DeckEntry) {
  cell.count += land.quantity;
  cell.cardIds.push(land.cardId);
}

/**
 * The deck as it would stand if the whole potential pile were promoted. Feed it
 * to `analyzeLandBase` alongside the real thing to show what promoting would do
 * before doing it. The wishlist stays out — it isn't a candidate for this deck.
 */
export function withPotentialPromoted(entries: DeckEntry[]): DeckEntry[] {
  return entries.map((entry) => (entry.slot === "maybe" ? { ...entry, slot: "main" } : entry));
}

export function analyzeLandBase(entries: DeckEntry[]): LandBaseAnalysis {
  // Main deck only: the potential pile is what the analysis page cuts from.
  const lands = entries.filter((e) => e.slot === "main" && !e.isCommander && isLand(e));

  // Partners and backgrounds share one identity. Before a commander is chosen,
  // the lands' own identities stand in.
  const commanders = entries.filter((e) => e.isCommander);
  const identitySource = commanders.length > 0 ? commanders : lands;
  const identity = COLOR_ORDER.filter((c) => identitySource.some((e) => e.colorIdentity.includes(c)));
  const columns: ManaColumn[] = [...identity, "C", "any"];

  const rows: LandBaseRow[] = LAND_CAPABILITIES.map((capability) => ({
    capabilityId: capability.id,
    group: capability.group,
    label: capability.label,
    description: capability.description,
    total: { count: 0, cardIds: [] },
    cells: emptyCells(columns, capability.id),
  }));
  const sources = emptyCells(columns);
  const producesNothingIds: string[] = [];
  let landCount = 0;

  for (const land of lands) {
    landCount += land.quantity;
    const colours = landColours(land, identity);

    for (const column of columns) {
      if (colours.has(column)) add(sources[column]!, land);
    }

    LAND_CAPABILITIES.forEach((capability, i) => {
      if (!capability.test(land, colours)) return;
      add(rows[i].total, land);
      for (const column of columns) {
        const cell = rows[i].cells[column];
        if (cell && colours.has(column)) add(cell, land);
      }
    });

    // Judged against all five colours, not the identity: an off-colour land
    // makes mana, it's just the wrong mana.
    if (landColours(land, COLOR_ORDER).size === 0 && !isFetch(land)) {
      producesNothingIds.push(land.cardId);
    }
  }

  return { identity, columns, rows, sources, landCount, producesNothingIds };
}
