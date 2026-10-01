/**
 * Which printings /prices tries on Ítaca, and which result it shows.
 * Pure, so node:test can load it; the Ítaca and cache calls live in
 * deck-pricing.ts. See docs/plans/moxfield-prices.md ("Other printings").
 */

import type { CardPrice, PrintingAttempt } from "@/lib/price-events";

/** Ítaca requests per card, at 5s each. Sol Ring alone has ~100 paper sets. */
export const MAX_ATTEMPTS_PER_CARD = 8;

/**
 * The printing the list names goes first, so the copy the user asked about is
 * always checked; the rest keep their order (newest first from Scryfall).
 */
export function orderPrintings<T extends { setCode: string }>(
  printings: T[],
  namedSetCode: string | null
): T[] {
  const named = printings.find((p) => p.setCode === namedSetCode);
  return named ? [named, ...printings.filter((p) => p !== named)] : printings;
}

/**
 * Cheapest in-stock copy across every printing checked. When nothing is in
 * stock, "sold out" only if some printing exists on Ítaca at all — a card no
 * printing of which is listed is "not found", not sold out.
 */
export function pickBest(key: string, attempts: PrintingAttempt[], namedSetCode: string | null): CardPrice {
  const inStock = attempts.filter(
    (a) => a.status === "found" && a.inStock && a.lowestPriceCents != null
  );
  if (inStock.length > 0) {
    const best = inStock.reduce((a, b) => (b.lowestPriceCents! < a.lowestPriceCents! ? b : a));
    return { key, status: "in_stock", best, attempts };
  }
  const listed = attempts.filter((a) => a.status === "found");
  if (listed.length > 0) {
    const best = listed.find((a) => a.setCode === namedSetCode) ?? listed[0];
    return { key, status: "sold_out", best, attempts };
  }
  const status = attempts.some((a) => a.status === "error") ? "error" : "not_found";
  return { key, status, best: null, attempts };
}
