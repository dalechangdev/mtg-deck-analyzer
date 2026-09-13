/**
 * itaca.gg's transport: the shared StoreHttp plus this store's robots policy.
 *
 * Verified against https://itaca.gg/robots.txt on 2026-08-31:
 *   Crawl-delay: 5
 *   Disallow: /search/index, /search/card, /searchBuyList/index,
 *             /advancedSearch/search, /analyticsEntry/*
 *   Allow:    /magic/expansions, /magic/products/singles/*, /magic/buylist/, ...
 *
 * The origin sends no ETag, no Last-Modified and `cf-cache-status: DYNAMIC`,
 * so conditional requests are impossible — every poll is a full origin hit of
 * roughly 200KB. That is why callers should poll listing pages (20 cards each)
 * rather than product pages (1 card each). See docs/RATE_LIMITING.md.
 */

import { StoreHttp, type RobotsPolicy, type StoreHttpOptions } from "@mtg/store-core";

export const ITACA_BASE = "https://itaca.gg";

/** robots.txt Crawl-delay, in milliseconds. Do not lower this. */
export const CRAWL_DELAY_MS = 5000;

export const ITACA_ROBOTS: RobotsPolicy = {
  host: "itaca.gg",
  minIntervalMs: CRAWL_DELAY_MS,
  disallow: [
    "/analyticsEntry/",
    "/search/index",
    "/search/card",
    "/searchBuyList/index",
    "/advancedSearch/search",
  ],
  allow: [
    "/magic/expansions",
    "/magic/products/singles",
    "/magic/sealed",
    "/magic/accessories",
    "/magic/buylist/",
    "/lorcana",
  ],
};

export type ItacaHttpOptions = Omit<StoreHttpOptions, "baseUrl" | "policy">;

export class ItacaHttp extends StoreHttp {
  constructor(opts: ItacaHttpOptions = {}) {
    super({
      ...opts,
      baseUrl: ITACA_BASE,
      policy: ITACA_ROBOTS,
      userAgent: opts.userAgent ?? "itaca-restock-bot/0.1 (+https://example.com/bot)",
    });
  }
}
