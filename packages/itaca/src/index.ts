export * from "./types";
export { ItacaClient, PAGE_SIZE, type ItacaClientOptions } from "./client";
export { ItacaAdapter } from "./adapter";
export {
  ItacaHttp,
  ITACA_ROBOTS,
  CRAWL_DELAY_MS,
  ITACA_BASE,
  type ItacaHttpOptions,
} from "./http";
export { parseListingPage, parseExpansionsIndex } from "./parse-listing";
export { parseProductPage } from "./parse-product";

// Re-exported so consumers of a single store adapter do not need to depend on
// @mtg/store-core directly.
export {
  InProcessRateLimiter,
  RobotsViolationError,
  assertPathAllowed,
  sleep,
  normalize,
  slugify,
  parsePriceCents,
  type RateLimiter,
  type StoreAdapter,
  type StoreCatalogPage,
  type StoreProduct,
  type StoreOffer,
} from "@mtg/store-core";
