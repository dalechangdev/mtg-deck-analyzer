/**
 * Totals and naming for a /prices run, shared by the live page, the saved
 * page and the route that saves it — so a snapshot reads exactly as it did
 * live. Pure, so node:test can load it.
 */

import type { CardPrice, PricedLine } from "@/lib/price-events";

/** What `PriceSearch.result` holds. `v` lets a later shape tell old rows apart. */
export type PriceSnapshot = {
  v: 1;
  lines: PricedLine[];
  results: CardPrice[];
  skippedBasics: number;
  unparsed: string[];
};

export type PriceSummary = {
  totalCents: number;
  currency: string | null;
  /** Copies with an in-stock price. */
  pricedCards: number;
  /** Copies in the list (after skipping basics). */
  totalCards: number;
};

/** Unit price used for totals: only an in-stock copy counts. */
export function unitPriceCents(result: CardPrice | undefined): number | null {
  return result?.status === "in_stock" ? (result.best?.lowestPriceCents ?? null) : null;
}

export function summarize(lines: PricedLine[], results: Map<string, CardPrice>): PriceSummary {
  let totalCents = 0;
  let pricedCards = 0;
  let totalCards = 0;
  let currency: string | null = null;
  for (const line of lines) {
    totalCards += line.quantity;
    const result = line.key ? results.get(line.key) : undefined;
    const each = unitPriceCents(result);
    if (each == null) continue;
    totalCents += each * line.quantity;
    pricedCards += line.quantity;
    currency ??= result?.best?.currency ?? null;
  }
  return { totalCents, currency, pricedCards, totalCards };
}

/**
 * Default name for a saved search: the commander(s) when the list has a
 * commander section, otherwise the first card and a count of the rest.
 */
export function searchName(lines: PricedLine[]): string {
  const commanders = lines.filter((l) => l.board === "commanders").map((l) => l.name);
  if (commanders.length > 0) return commanders.join(" & ");
  if (lines.length === 0) return "Empty list";
  const rest = lines.length - 1;
  return rest > 0 ? `${lines[0].name} + ${rest} more` : lines[0].name;
}

export type DeckCardInput = { cardId: string; quantity: number; isCommander: boolean };

/**
 * The deck cards a priced list becomes: one row per card (DeckCard is unique
 * per version and card), quantities summed across lines, a commander if any of
 * its lines was in the commander section. Unknown cards are returned by name,
 * since there is no Card row to point at.
 */
export function deckCardsFromLines(lines: PricedLine[]): { cards: DeckCardInput[]; unknown: string[] } {
  const byCard = new Map<string, DeckCardInput>();
  const unknown: string[] = [];
  for (const line of lines) {
    if (!line.key) {
      unknown.push(line.name);
      continue;
    }
    const isCommander = line.board === "commanders";
    const seen = byCard.get(line.key);
    if (seen) {
      seen.quantity += line.quantity;
      seen.isCommander ||= isCommander;
    } else {
      byCard.set(line.key, { cardId: line.key, quantity: line.quantity, isCommander });
    }
  }
  return { cards: [...byCard.values()], unknown };
}
