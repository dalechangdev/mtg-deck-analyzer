/**
 * ItacaClient.getPricing's request budget. Network is stubbed, so this checks
 * which paths would be fetched, not what the site returns.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { ItacaClient } from "../src/client";
import { parseExpansionsIndex } from "../src/parse-listing";

const fixture = (name: string) =>
  gunzipSync(readFileSync(join(import.meta.dirname, "fixtures", name))).toString("utf8");

const expansions = fixture("expansions.html.gz");
const listing = fixture("listing-secrets-of-strixhaven.html.gz");
const strixhaven = parseExpansionsIndex(expansions).find(
  (e) => e.slug === "secrets-of-strixhaven"
);

/** Serves the fixtures and records every path requested. Product pages 404. */
function recordingClient() {
  const paths: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    const { pathname } = new URL(String(url));
    paths.push(pathname);
    if (pathname === "/magic/expansions") return new Response(expansions, { status: 200 });
    if (pathname === "/magic/products/singles/secrets-of-strixhaven") {
      return new Response(listing, { status: 200 });
    }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;

  const client = new ItacaClient({
    fetchImpl,
    rateLimiter: { acquire: async () => {}, penalize: async () => {} },
  });
  return { client, paths };
}

test("the fixture still lists the expansion these tests use", () => {
  assert.ok(strixhaven, "expected secrets-of-strixhaven in expansions fixture");
});

test("scan: false returns null on a slug miss without walking the expansion", async () => {
  const { client, paths } = recordingClient();
  const pricing = await client.getPricing("No Such Card", strixhaven!.name, { scan: false });

  assert.equal(pricing, null);
  assert.deepEqual(paths, [
    "/magic/expansions",
    "/magic/products/singles/secrets-of-strixhaven/no-such-card",
  ]);
});

test("the default still falls back to the listing pages", async () => {
  const { client, paths } = recordingClient();
  await client.getPricing("No Such Card", strixhaven!.name);

  assert.ok(paths.includes("/magic/products/singles/secrets-of-strixhaven"));
});

test("findExpansionSlug matches Scryfall's word order for precon sets", async () => {
  const { client } = recordingClient();
  assert.equal(
    await client.findExpansionSlug("Modern Horizons 3 Commander"),
    "commander-modern-horizons-3"
  );
});

test("findExpansionSlug prefers the closest containing name over the first", async () => {
  const { client } = recordingClient();
  // "Commander" (the 2011 set) is contained in this name too, and listed earlier.
  assert.equal(await client.findExpansionSlug("Commander Masters Promos"), "commander-masters");
  assert.equal(await client.findExpansionSlug("Commander 2016"), "commander-2016");
});

test("findExpansionSlug with fuzzy: false refuses containment-only matches", async () => {
  const { client } = recordingClient();
  assert.equal(await client.findExpansionSlug("Commander Masters Promos", { fuzzy: false }), null);
  assert.equal(
    await client.findExpansionSlug("Modern Horizons 3 Commander", { fuzzy: false }),
    "commander-modern-horizons-3"
  );
});
