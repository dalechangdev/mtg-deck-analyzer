import {
  CATEGORY_ORDER,
  getCardCategory,
  isManaRamp,
  type CardCategory,
  type DeckEntry,
} from "@/lib/commander";
import type { TemplateAnalysis } from "@/lib/deck-template";
import type { VersionSummary } from "@/lib/deck-api";

// Pure comparisons between deck versions. No I/O: the compare route, the page
// and the tests all hand it card lists, so the arithmetic is tested once.

// ---------------------------------------------------------------------------
// Card diff
// ---------------------------------------------------------------------------

export type DiffCard = {
  cardId: string;
  name: string;
  manaCost: string | null;
  typeLine: string;
  quantity: number;
  isCommander: boolean;
};

export type QuantityChange = Omit<DiffCard, "quantity" | "isCommander"> & {
  from: number;
  to: number;
};

export type VersionDiff = {
  /** In `to`, not in `from`. */
  added: DiffCard[];
  /** In `from`, not in `to`. */
  removed: DiffCard[];
  /** In both at different counts — in practice, basic lands. */
  changedQuantity: QuantityChange[];
  unchangedCount: number;
  commander: { from: string | null; to: string | null };
};

function mainDeckByCard(entries: DeckEntry[]): Map<string, DiffCard> {
  const byCard = new Map<string, DiffCard>();
  for (const e of entries) {
    if (e.slot !== "main") continue;
    const existing = byCard.get(e.cardId);
    // One row per card per version is a unique index, but merge rather than trust it.
    if (existing) {
      existing.quantity += e.quantity;
      existing.isCommander ||= e.isCommander;
      continue;
    }
    byCard.set(e.cardId, {
      cardId: e.cardId,
      name: e.name,
      manaCost: e.manaCost,
      typeLine: e.typeLine,
      quantity: e.quantity,
      isCommander: e.isCommander,
    });
  }
  return byCard;
}

const byName = (x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name);

/**
 * What changed in the main deck going from `from` to `to`.
 *
 * Keyed by card, never by DeckCard row: a copied version has new row ids for
 * the same cards, and must diff as unchanged. Potential and wishlist piles are
 * ignored — they're where cards are considered, not what gets played.
 */
export function diffVersions(from: DeckEntry[], to: DeckEntry[]): VersionDiff {
  const before = mainDeckByCard(from);
  const after = mainDeckByCard(to);

  const added: DiffCard[] = [];
  const removed: DiffCard[] = [];
  const changedQuantity: QuantityChange[] = [];
  let unchangedCount = 0;

  for (const [cardId, card] of after) {
    const previous = before.get(cardId);
    if (!previous) {
      added.push(card);
    } else if (previous.quantity !== card.quantity) {
      changedQuantity.push({
        cardId,
        name: card.name,
        manaCost: card.manaCost,
        typeLine: card.typeLine,
        from: previous.quantity,
        to: card.quantity,
      });
    } else {
      unchangedCount++;
    }
  }
  for (const [cardId, card] of before) {
    if (!after.has(cardId)) removed.push(card);
  }

  const commanderOf = (deck: Map<string, DiffCard>) =>
    [...deck.values()].find((c) => c.isCommander)?.name ?? null;

  return {
    added: added.sort(byName),
    removed: removed.sort(byName),
    changedQuantity: changedQuantity.sort(byName),
    unchangedCount,
    commander: { from: commanderOf(before), to: commanderOf(after) },
  };
}

// ---------------------------------------------------------------------------
// Curve and stats
// ---------------------------------------------------------------------------

export const MAX_SHOWN_CMC = 7;
const TOP_BIN_LABEL = `${MAX_SHOWN_CMC}+`;

export type CurveBin = { label: string; count: number; cards: string[] };

/**
 * Main-deck curve: a Land bin, then mana value 0–6 and 7+. Always the same bins
 * in the same order, so two versions' curves line up bin for bin.
 *
 * The commander is left out: it's always available, so it isn't part of what
 * you draw. "Land" means land anywhere in the type line, so a modal
 * double-faced land or Dryad Arbor counts as a land — as the builder's curve
 * always has.
 */
export function curveBins(entries: DeckEntry[]): CurveBin[] {
  const land: CurveBin = { label: "Land", count: 0, cards: [] };
  const bins: CurveBin[] = Array.from({ length: MAX_SHOWN_CMC + 1 }, (_, i) => ({
    label: i === MAX_SHOWN_CMC ? TOP_BIN_LABEL : String(i),
    count: 0,
    cards: [],
  }));

  for (const entry of entries) {
    if (entry.slot !== "main" || entry.isCommander) continue;
    const bin = entry.typeLine.toLowerCase().includes("land")
      ? land
      : bins[Math.min(Math.floor(entry.cmc ?? 0), MAX_SHOWN_CMC)];
    bin.count += entry.quantity;
    bin.cards.push(entry.name);
  }

  return [land, ...bins];
}

/**
 * Average mana value across the non-land bins, counting 7+ as 7 — the figure
 * the builder's curve shows, so the two pages never disagree. Null with no spells.
 */
export function curveAverage(bins: CurveBin[]): number | null {
  let spells = 0;
  let total = 0;
  for (const bin of bins) {
    if (bin.label === "Land") continue;
    const cmc = bin.label === TOP_BIN_LABEL ? MAX_SHOWN_CMC : Number(bin.label);
    spells += bin.count;
    total += cmc * bin.count;
  }
  return spells === 0 ? null : total / spells;
}

export type VersionStats = {
  /** Main slot, commander included — the number checked against 100. */
  mainCount: number;
  lands: number;
  /** Non-land main-deck cards, commander excluded. */
  spells: number;
  averageCmc: number | null;
  ramp: number;
  /** By type, commander excluded. */
  categories: Record<CardCategory, number>;
  curve: CurveBin[];
};

export function versionStats(entries: DeckEntry[]): VersionStats {
  const curve = curveBins(entries);
  const categories = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<
    CardCategory,
    number
  >;

  let mainCount = 0;
  let ramp = 0;
  for (const entry of entries) {
    if (entry.slot !== "main") continue;
    mainCount += entry.quantity;
    if (entry.isCommander) continue;
    categories[getCardCategory(entry.typeLine)] += entry.quantity;
    if (isManaRamp(entry)) ramp += entry.quantity;
  }

  const lands = curve[0].count;
  return {
    mainCount,
    lands,
    spells: curve.slice(1).reduce((sum, bin) => sum + bin.count, 0),
    averageCmc: curveAverage(curve),
    ramp,
    categories,
    curve,
  };
}

/** Wins over games with a recorded result. Draws count against; unrecorded games don't count. */
export function winRate(record: { wins: number; losses: number; draws: number }): number | null {
  const decided = record.wins + record.losses + record.draws;
  return decided === 0 ? null : record.wins / decided;
}

// ---------------------------------------------------------------------------
// Comparison payload
// ---------------------------------------------------------------------------

export type ComparedVersion = {
  summary: VersionSummary;
  stats: VersionStats;
  analysis: TemplateAnalysis;
};

/**
 * What the compare API returns and the compare page renders. `a` is the version
 * under inspection and `b` its baseline; `diff` runs from b to a, so "added" is
 * what a has that b doesn't.
 */
export type VersionComparison = {
  versions: VersionSummary[];
  a: ComparedVersion;
  b: ComparedVersion;
  diff: VersionDiff;
};
