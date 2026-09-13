/**
 * Parser tests run against real captured pages (test/fixtures/*.html) rather
 * than hand-written HTML, because the thing most likely to break this package
 * is itaca changing its markup — and only a real capture catches that.
 *
 * Run: pnpm --filter @mtg/itaca test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { parseExpansionsIndex, parseListingPage } from "../src/parse-listing";

// Fixtures are stored gzipped — the raw pages are ~1.4MB of mostly boilerplate.
const fixture = (name: string) =>
  gunzipSync(readFileSync(join(import.meta.dirname, "fixtures", `${name}.gz`))).toString("utf8");

test("parses an in-stock expansion listing page", () => {
  const page = parseListingPage(
    fixture("listing-secrets-of-strixhaven.html"),
    "secrets-of-strixhaven",
    0
  );

  assert.equal(page.products.length, 20, "listing pages hold 20 cards");
  assert.equal(page.hasNextPage, true);
  assert.equal(page.nextOffset, 20);

  const capstone = page.products.find((p) => p.name === "Improvisation Capstone");
  assert.ok(capstone, "expected Improvisation Capstone on the first page");
  assert.equal(capstone.productId, "880508");
  assert.equal(capstone.slug, "improvisation-capstone");
  assert.equal(capstone.totalAvailable, 21);
  assert.equal(capstone.lowestPriceCents, 1195);
  assert.equal(capstone.currency, "EUR");

  const nm = capstone.articles.find((a) => a.articleId === "2076006057");
  assert.ok(nm, "expected the NM English article");
  assert.equal(nm.quantity, 15);
  assert.equal(nm.priceCents, 1195);
  assert.equal(nm.language, "ENGLISH");
  assert.equal(nm.condition, "NM");
  assert.equal(nm.isFoil, false);
  assert.equal(nm.isSigned, false);
  assert.equal(nm.isAltered, false);
  assert.equal(nm.isPreorder, false);
});

test("every parsed article carries an id, a quantity and a price", () => {
  const page = parseListingPage(
    fixture("listing-secrets-of-strixhaven.html"),
    "secrets-of-strixhaven",
    0
  );
  const articles = page.products.flatMap((p) => p.articles);
  assert.ok(articles.length > 0, "expected some articles");

  for (const a of articles) {
    assert.match(a.articleId, /^\d+$/);
    assert.ok(Number.isInteger(a.quantity) && a.quantity >= 0, `bad qty ${a.quantity}`);
    assert.ok(Number.isInteger(a.priceCents) && a.priceCents > 0, `bad price ${a.priceCents}`);
    assert.notEqual(a.language, "UNKNOWN");
  }
});

test("a sold-out set yields products with no articles and no price", () => {
  const page = parseListingPage(
    fixture("listing-sold-out.html"),
    "secret-lair-drop-series-superdrop-of-the-moonlight-jellies",
    0
  );

  assert.ok(page.products.length > 0, "sold-out tiles still parse as products");
  const ooze = page.products.find((p) => p.name.startsWith("Ooze Token"));
  assert.ok(ooze);
  assert.equal(ooze.articles.length, 0);
  assert.equal(ooze.lowestPriceCents, null);
  assert.equal(ooze.totalAvailable, 0);
});

test("parses the expansions index", () => {
  const expansions = parseExpansionsIndex(fixture("expansions.html"));
  assert.ok(expansions.length > 500, `expected hundreds of sets, got ${expansions.length}`);

  const strixhaven = expansions.find((e) => e.slug === "secrets-of-strixhaven");
  assert.ok(strixhaven);
  assert.equal(strixhaven.name, "Secrets of Strixhaven");

  // Names are used for fuzzy set matching, so entities must be decoded.
  assert.ok(!expansions.some((e) => e.name.includes("&amp;")), "entities must be decoded");
});
