import { CATEGORY_ORDER, getCardCategory, type DeckEntry } from "@/lib/commander";
import { COLOR_LABELS, COLOR_ORDER } from "@/lib/mtg-styles";

// The analysis page's cross-tab: the main deck counted along two dimensions at
// once (type × mana value, colour × role, …). Pure, like the evaluator, so
// promoting a card or overriding a role recounts in the browser.
//
// Type, mana value and colour put each card in exactly one bucket. Role and
// tag do not — a card can fill several roles or carry several tags, or none —
// so their totals are distinct cards, never a sum of the cells beside them.

export type BreakdownDimension = "type" | "cmc" | "color" | "role" | "tag" | "none";

export const DIMENSION_LABEL: Record<BreakdownDimension, string> = {
  type: "Type",
  cmc: "Mana value",
  color: "Color",
  role: "Role",
  tag: "Scryfall tag",
  none: "None",
};

/** A card carries one bucket on these dimensions, or several, or none. */
export const MULTI_VALUED: ReadonlySet<BreakdownDimension> = new Set(["role", "tag"]);

/**
 * Dimensions only offered as rows. A deck carries hundreds of tags, which
 * read as a list but not as columns.
 */
export const ROW_ONLY: ReadonlySet<BreakdownDimension> = new Set(["tag"]);

export type BreakdownBucket = { key: string; label: string };

export type BreakdownCell = {
  /** Copies, not rows: eight Forests count eight. */
  count: number;
  cardIds: string[];
};

export type DeckBreakdown = {
  rows: BreakdownBucket[];
  columns: BreakdownBucket[];
  /** Keyed by `cellKey(row, column)`; absent means empty. */
  cells: Map<string, BreakdownCell>;
  rowTotals: Map<string, BreakdownCell>;
  columnTotals: Map<string, BreakdownCell>;
  total: BreakdownCell;
};

/** What the role dimension reads, from the template analysis. */
export type RoleContext = {
  roles: { id: string; name: string }[];
  /** cardId → the roles it fills, overrides already applied. */
  rolesByCard: ReadonlyMap<string, ReadonlySet<string>>;
};

export const ALL = "*";
export const NO_ROLE = "none";
// Tag buckets are keyed by label, and Tagger has no tag called this.
export const NO_TAG = "\u0000untagged";
const MULTICOLOR = "multi";
const COLORLESS = "C";
/** Seven and up share a bucket, as on Moxfield's curve. */
const CMC_CAP = 7;

export function cellKey(row: string, column: string): string {
  return `${row}|${column}`;
}

/** Single bucket for exclusive dimensions; one or more for role and tag. */
function bucketsOf(card: DeckEntry, dimension: BreakdownDimension, ctx: RoleContext): string[] {
  switch (dimension) {
    case "none":
      return [ALL];
    case "type":
      return [getCardCategory(card.typeLine)];
    case "cmc":
      return [String(Math.min(CMC_CAP, Math.floor(card.cmc)))];
    case "color": {
      const identity = card.colorIdentity;
      if (identity.length === 0) return [COLORLESS];
      return identity.length === 1 ? [identity[0]] : [MULTICOLOR];
    }
    case "role": {
      const filled = ctx.rolesByCard.get(card.cardId);
      // Template order, not set order, so a card's roles list predictably.
      const ids = ctx.roles.filter((r) => filled?.has(r.id)).map((r) => r.id);
      return ids.length > 0 ? ids : [NO_ROLE];
    }
    case "tag":
      return card.oracleTags && card.oracleTags.length > 0 ? card.oracleTags : [NO_TAG];
  }
}

/**
 * Every bucket a dimension can show, in display order, before trimming
 * empties. Tags have no fixed set, so they come from the cards: most common
 * first, which puts broad parents like "card advantage" above their leaves.
 */
function orderedBuckets(
  dimension: BreakdownDimension,
  ctx: RoleContext,
  totals: Map<string, BreakdownCell>
): BreakdownBucket[] {
  switch (dimension) {
    case "none":
      return [{ key: ALL, label: "All" }];
    case "type":
      return CATEGORY_ORDER.map((c) => ({ key: c, label: c }));
    case "cmc":
      return Array.from({ length: CMC_CAP + 1 }, (_, n) => ({
        key: String(n),
        label: n === CMC_CAP ? `${n}+` : String(n),
      }));
    case "color":
      return [
        ...COLOR_ORDER.map((c) => ({ key: c as string, label: COLOR_LABELS[c] })),
        { key: MULTICOLOR, label: "Multicolor" },
        { key: COLORLESS, label: "Colorless" },
      ];
    case "role":
      return [
        ...ctx.roles.map((r) => ({ key: r.id, label: r.name })),
        { key: NO_ROLE, label: "No role" },
      ];
    case "tag":
      return [
        ...[...totals]
          .filter(([key]) => key !== NO_TAG)
          .sort(([a, x], [b, y]) => y.count - x.count || a.localeCompare(b))
          .map(([key]) => ({ key, label: key })),
        { key: NO_TAG, label: "No tag" },
      ];
  }
}

/**
 * Drop empty buckets — except mana value, which keeps the gaps between its
 * lowest and highest bucket so the columns still read as a curve.
 */
function visibleBuckets(
  dimension: BreakdownDimension,
  ctx: RoleContext,
  totals: Map<string, BreakdownCell>
): BreakdownBucket[] {
  const all = orderedBuckets(dimension, ctx, totals);
  if (dimension !== "cmc") return all.filter((b) => totals.has(b.key));
  const indexes = all.map((b, i) => (totals.has(b.key) ? i : -1)).filter((i) => i >= 0);
  if (indexes.length === 0) return [];
  return all.slice(indexes[0], indexes[indexes.length - 1] + 1);
}

function add(map: Map<string, BreakdownCell>, key: string, card: DeckEntry) {
  const cell = map.get(key) ?? { count: 0, cardIds: [] };
  if (cell.cardIds.includes(card.cardId)) return;
  cell.count += card.quantity;
  cell.cardIds.push(card.cardId);
  map.set(key, cell);
}

/**
 * Cross-tabulate the main deck. The commander is left out, matching the
 * template scorecard's card count above it.
 */
export function breakdownDeck(
  entries: DeckEntry[],
  rowDimension: BreakdownDimension,
  columnDimension: BreakdownDimension,
  ctx: RoleContext
): DeckBreakdown {
  const cards = entries
    .filter((e) => e.slot === "main" && !e.isCommander)
    .sort((a, b) => a.name.localeCompare(b.name));

  const cells = new Map<string, BreakdownCell>();
  const rowTotals = new Map<string, BreakdownCell>();
  const columnTotals = new Map<string, BreakdownCell>();
  const total: BreakdownCell = { count: 0, cardIds: [] };

  for (const card of cards) {
    const rows = bucketsOf(card, rowDimension, ctx);
    const columns = bucketsOf(card, columnDimension, ctx);
    for (const row of rows) {
      add(rowTotals, row, card);
      for (const column of columns) add(cells, cellKey(row, column), card);
    }
    for (const column of columns) add(columnTotals, column, card);
    total.count += card.quantity;
    total.cardIds.push(card.cardId);
  }

  return {
    rows: visibleBuckets(rowDimension, ctx, rowTotals),
    columns: visibleBuckets(columnDimension, ctx, columnTotals),
    cells,
    rowTotals,
    columnTotals,
    total,
  };
}

/** A drill-down's cards grouped by type, Moxfield-style; empty groups dropped. */
export function groupByType<T extends { typeLine: string }>(
  cards: T[]
): { category: string; cards: T[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    cards: cards.filter((c) => getCardCategory(c.typeLine) === category),
  })).filter((g) => g.cards.length > 0);
}
