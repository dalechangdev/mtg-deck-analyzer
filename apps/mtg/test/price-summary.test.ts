import assert from "node:assert/strict";
import test from "node:test";

import { searchName, summarize } from "../src/lib/price-summary";
import type { CardPrice, PricedLine, PrintingAttempt } from "../src/lib/price-events";

const line = (name: string, over: Partial<PricedLine> = {}): PricedLine => ({
  quantity: 1,
  name,
  board: "mainboard",
  key: name.toLowerCase(),
  namedSetCode: null,
  ...over,
});

const attempt = (cents: number | null, inStock = true): PrintingAttempt => ({
  setCode: "fdc",
  setName: "Foundations Commander",
  status: "found",
  inStock,
  lowestPriceCents: cents,
  currency: "EUR",
  url: null,
  fetchedAt: "2026-10-01T00:00:00.000Z",
  cached: false,
});

const price = (key: string, status: CardPrice["status"], best: PrintingAttempt | null): CardPrice => ({
  key,
  status,
  best,
  attempts: best ? [best] : [],
});

test("summarize totals in-stock copies only, by quantity", () => {
  const lines = [
    line("Sol Ring", { quantity: 2 }),
    line("Aether Spellbomb"),
    line("Rhystic Study"),
    line("Totally Fake Card", { key: null }),
  ];
  const results = new Map([
    ["sol ring", price("sol ring", "in_stock", attempt(95))],
    ["aether spellbomb", price("aether spellbomb", "in_stock", attempt(15))],
    ["rhystic study", price("rhystic study", "sold_out", attempt(null, false))],
  ]);
  assert.deepEqual(summarize(lines, results), {
    totalCents: 205,
    currency: "EUR",
    pricedCards: 3,
    totalCards: 5,
  });
});

test("summarize of an unpriced list is zero with no currency", () => {
  assert.deepEqual(summarize([line("Sol Ring")], new Map()), {
    totalCents: 0,
    currency: null,
    pricedCards: 0,
    totalCards: 1,
  });
});

test("searchName prefers the commanders", () => {
  assert.equal(
    searchName([line("Sol Ring"), line("Tymna the Weaver", { board: "commanders" }), line("Thrasios, Triton Hero", { board: "commanders" })]),
    "Tymna the Weaver & Thrasios, Triton Hero"
  );
});

test("searchName falls back to the first card and a count", () => {
  assert.equal(searchName([line("Sol Ring"), line("Arcane Signet"), line("Command Tower")]), "Sol Ring + 2 more");
  assert.equal(searchName([line("Sol Ring")]), "Sol Ring");
});
