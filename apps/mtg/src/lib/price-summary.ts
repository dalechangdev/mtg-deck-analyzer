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
