import assert from "node:assert/strict";
import test from "node:test";

import { orderPrintings, pickBest } from "../src/lib/printing-choice";
import type { PrintingAttempt } from "../src/lib/price-events";

const attempt = (setCode: string, over: Partial<PrintingAttempt> = {}): PrintingAttempt => ({
  setCode,
  setName: setCode.toUpperCase(),
  status: "found",
  inStock: true,
  lowestPriceCents: 100,
  currency: "EUR",
  url: `https://itaca.gg/${setCode}`,
  fetchedAt: "2026-10-01T00:00:00.000Z",
  cached: false,
  ...over,
});

test("orderPrintings puts the named set first and keeps the rest in order", () => {
  const printings = [{ setCode: "fdc" }, { setCode: "j22" }, { setCode: "mma" }];
  assert.deepEqual(orderPrintings(printings, "mma").map((p) => p.setCode), ["mma", "fdc", "j22"]);
  assert.deepEqual(orderPrintings(printings, null).map((p) => p.setCode), ["fdc", "j22", "mma"]);
  assert.deepEqual(orderPrintings(printings, "zzz").map((p) => p.setCode), ["fdc", "j22", "mma"]);
});

test("pickBest takes the cheapest in-stock printing, not the named one", () => {
  const result = pickBest(
    "card",
    [attempt("cmm", { lowestPriceCents: 245 }), attempt("fdc", { lowestPriceCents: 110 }), attempt("c21", { lowestPriceCents: 150 })],
    "cmm"
  );
  assert.equal(result.status, "in_stock");
  assert.equal(result.best?.setCode, "fdc");
  assert.equal(result.attempts.length, 3);
});

test("a sold-out named printing doesn't hide an in-stock one elsewhere", () => {
  const result = pickBest(
    "card",
    [attempt("mma", { inStock: false, lowestPriceCents: null }), attempt("fdc", { lowestPriceCents: 35 })],
    "mma"
  );
  assert.equal(result.status, "in_stock");
  assert.equal(result.best?.setCode, "fdc");
});

test("sold out only when some printing is listed, preferring the named one", () => {
  const result = pickBest(
    "card",
    [
      attempt("fdc", { inStock: false, lowestPriceCents: null }),
      attempt("mma", { inStock: false, lowestPriceCents: null }),
      attempt("mrd", { status: "not_found", inStock: false, lowestPriceCents: null }),
    ],
    "mma"
  );
  assert.equal(result.status, "sold_out");
  assert.equal(result.best?.setCode, "mma");
});

test("not found when no printing is listed; error when a lookup failed", () => {
  const missing = attempt("c16", { status: "not_found", inStock: false, lowestPriceCents: null });
  assert.equal(pickBest("card", [missing], null).status, "not_found");
  assert.equal(pickBest("card", [], null).status, "not_found");
  assert.equal(
    pickBest("card", [missing, attempt("fdc", { status: "error", inStock: false, lowestPriceCents: null })], null).status,
    "error"
  );
});
