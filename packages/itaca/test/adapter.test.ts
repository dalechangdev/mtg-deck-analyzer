/**
 * Verifies Ítaca through the generic StoreAdapter surface — the shape the
 * crawler and the persistence layer actually consume.
 *
 * Network is stubbed with the captured fixture, so this exercises cursor
 * handling and the mapping to store-agnostic types without touching the site.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { ItacaAdapter } from "../src/adapter";

const listing = gunzipSync(
  readFileSync(
    join(import.meta.dirname, "fixtures", "listing-secrets-of-strixhaven.html.gz")
  )
).toString("utf8");

function stubFetch(body: string): typeof fetch {
  return (async (url: string | URL | Request) =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;
}

test("fetchPage maps a listing page onto store-agnostic types", async () => {
  const adapter = new ItacaAdapter({
    fetchImpl: stubFetch(listing),
    // Keep the test fast; pacing is exercised by the database-level tests.
    rateLimiter: { acquire: async () => {}, penalize: async () => {} },
  });

  assert.equal(adapter.slug, "itaca");
  assert.equal(adapter.minIntervalMs, 5000);

  const page = await adapter.fetchPage("secrets-of-strixhaven:0");

  assert.equal(page.storeSlug, "itaca");
  assert.equal(page.cursor, "secrets-of-strixhaven:0");
  assert.equal(page.products.length, 20);
  // Cursor advances by the server's fixed page size of 20.
  assert.equal(page.nextCursor, "secrets-of-strixhaven:20");

  const capstone = page.products.find((p) => p.name === "Improvisation Capstone");
  assert.ok(capstone, "expected Improvisation Capstone");
  assert.equal(capstone.externalId, "880508");
  assert.equal(capstone.inStock, true);
  assert.equal(capstone.lowestPriceCents, 1195);
  assert.equal(
    capstone.url,
    "https://itaca.gg/magic/products/singles/secrets-of-strixhaven/improvisation-capstone"
  );

  const nm = capstone.offers.find((o) => o.externalId === "2076006057");
  assert.ok(nm, "expected the NM English offer");
  // Ítaca publishes exact counts, so quantity must be a number here — the null
  // case belongs to stores that only expose availability.
  assert.equal(nm.quantity, 15);
  assert.equal(nm.priceCents, 1195);
  assert.equal(nm.condition, "NM");
  assert.equal(nm.isFoil, false);
});

test("a cursor without an offset is treated as the first page", async () => {
  const adapter = new ItacaAdapter({
    fetchImpl: stubFetch(listing),
    rateLimiter: { acquire: async () => {}, penalize: async () => {} },
  });

  const page = await adapter.fetchPage("secrets-of-strixhaven:0");
  assert.equal(page.products.length, 20);
});
