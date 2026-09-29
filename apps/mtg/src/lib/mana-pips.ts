/**
 * Coloured mana symbols in the costs of a deck's spells — how hard the deck
 * leans on each colour, as opposed to colour identity (which colours it may
 * use) or the land base (which colours it can make).
 *
 * Pure: no Prisma, no DOM. The histogram widget and its tests both read it.
 */

/** WUBRG plus {C}, the colorless-specific pip (Kozilek's Return, Thought-Knot Seer). */
export const PIP_COLORS = ["W", "U", "B", "R", "G", "C"] as const;

export type PipColor = (typeof PIP_COLORS)[number];

const PIP_SET = new Set<string>(PIP_COLORS);

export type PipCounts = Record<PipColor, number>;

function emptyCounts(): PipCounts {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

/**
 * Pips per colour in one mana cost string.
 *
 * - Hybrid `{W/U}` counts once toward each colour — either can pay it, so it
 *   pressures both mana bases.
 * - Phyrexian `{G/P}` and twobrid `{2/W}` count toward their colour.
 * - Generic, `{X}` and snow `{S}` count toward nothing.
 * - Split cards arrive as `{1}{R} // {2}{U}`; both halves count.
 */
export function pipsInCost(manaCost: string | null): PipCounts {
  const counts = emptyCounts();
  for (const [, symbol] of (manaCost ?? "").matchAll(/\{([^}]+)\}/g)) {
    const colors = new Set(symbol.toUpperCase().split("/").filter((part) => PIP_SET.has(part)));
    for (const color of colors) counts[color as PipColor] += 1;
  }
  return counts;
}

export type PipBin = {
  color: PipColor;
  /** Pips across the counted cards, multiplied by quantity. */
  pips: number;
  /** Copies of cards with at least one pip of this colour. */
  cards: number;
  /** Those cards' names, most pips first — for the tooltip. */
  cardNames: string[];
};

export type PipAnalysis = {
  /** One bin per colour in PIP_COLORS order, zeros included. */
  bins: PipBin[];
  totalPips: number;
  /** Copies of nonland cards counted, whether or not they have coloured pips. */
  spellCount: number;
};

export type PipCard = {
  name: string;
  manaCost: string | null;
  typeLine: string;
  quantity: number;
  /** Rows outside the main deck are skipped; omit for a plain card list. */
  slot?: string;
};

/**
 * A spell // land MDFC is cast as a spell, so only the front face decides.
 * Transform cards with a land back (Growing Rites of Itlimoc) are spells too.
 */
function isFrontFaceLand(typeLine: string): boolean {
  return /\bland\b/i.test(typeLine.split(" // ")[0]);
}

/**
 * Pip counts over the nonland cards of a main deck. The commander counts: it
 * is cast from the command zone, often repeatedly, so its pips matter at least
 * as much as any spell's.
 *
 * MDFCs have no card-level mana cost (Scryfall puts it on the faces), so their
 * front-face pips are missed until the cost is carried on DeckEntry.
 */
export function analyzeCostPips(cards: PipCard[]): PipAnalysis {
  const spells = cards.filter(
    (c) => (c.slot === undefined || c.slot === "main") && !isFrontFaceLand(c.typeLine)
  );

  const bins = PIP_COLORS.map((color) => ({ color, pips: 0, cards: 0, byCard: [] as [string, number][] }));

  for (const card of spells) {
    const counts = pipsInCost(card.manaCost);
    for (const bin of bins) {
      const n = counts[bin.color];
      if (n === 0) continue;
      bin.pips += n * card.quantity;
      bin.cards += card.quantity;
      bin.byCard.push([card.name, n]);
    }
  }

  return {
    bins: bins.map(({ byCard, ...bin }) => ({
      ...bin,
      cardNames: byCard
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name]) => name),
    })),
    totalPips: bins.reduce((sum, b) => sum + b.pips, 0),
    spellCount: spells.reduce((sum, c) => sum + c.quantity, 0),
  };
}
