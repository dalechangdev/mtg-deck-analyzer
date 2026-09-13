import { ItacaHttp, type ItacaHttpOptions, ITACA_BASE } from "./http";
import { normalize, slugify } from "@mtg/store-core";
import { parseExpansionsIndex, parseListingPage } from "./parse-listing";
import { parseProductPage } from "./parse-product";
import type {
  ItacaExpansion,
  ItacaListingPage,
  ItacaPricing,
  ItacaProduct,
} from "./types";

/** Listing pages are fixed at 20 cards — the `max` query param is ignored by the server. */
export const PAGE_SIZE = 20;

/** Guard against runaway pagination if the next-arrow ever fails to disappear. */
const MAX_PAGES_PER_EXPANSION = 60;

export interface ItacaClientOptions extends ItacaHttpOptions {
  /** Cache TTL for the expansions index, which changes only on set release. */
  expansionsTtlMs?: number;
}

export class ItacaClient {
  private readonly http: ItacaHttp;
  private readonly expansionsTtlMs: number;
  private expansionsCache: { expiresAt: number; value: ItacaExpansion[] } | null = null;

  constructor(opts: ItacaClientOptions = {}) {
    this.http = new ItacaHttp(opts);
    this.expansionsTtlMs = opts.expansionsTtlMs ?? 24 * 60 * 60 * 1000;
  }

  async listExpansions(): Promise<ItacaExpansion[]> {
    if (this.expansionsCache && this.expansionsCache.expiresAt > Date.now()) {
      return this.expansionsCache.value;
    }
    const res = await this.http.get("/magic/expansions");
    const value = parseExpansionsIndex(res.html);
    this.expansionsCache = { expiresAt: Date.now() + this.expansionsTtlMs, value };
    return value;
  }

  async findExpansionSlug(setName: string): Promise<string | null> {
    const expansions = await this.listExpansions();
    const key = normalize(setName);
    const exact = expansions.find((e) => normalize(e.name) === key);
    if (exact) return exact.slug;
    const fuzzy = expansions.find((e) => {
      const n = normalize(e.name);
      return n.includes(key) || key.includes(n);
    });
    return fuzzy?.slug ?? null;
  }

  /** One listing page: 20 cards with their complete SKU/stock tables. */
  async getListingPage(expansionSlug: string, offset = 0): Promise<ItacaListingPage> {
    const res = await this.http.get(
      `/magic/products/singles/${expansionSlug}?max=${PAGE_SIZE}&offset=${offset}`
    );
    return parseListingPage(res.html, expansionSlug, offset);
  }

  /**
   * Walks every page of an expansion, yielding as it goes so a caller can
   * persist incrementally instead of buffering a whole set in memory.
   * Pacing is handled by the rate limiter inside the transport.
   */
  async *iterateExpansion(expansionSlug: string): AsyncGenerator<ItacaListingPage> {
    let offset = 0;
    for (let page = 0; page < MAX_PAGES_PER_EXPANSION; page++) {
      const listing = await this.getListingPage(expansionSlug, offset);
      if (listing.products.length === 0) return;
      yield listing;
      if (!listing.hasNextPage || listing.nextOffset === null) return;
      offset = listing.nextOffset;
    }
  }

  /**
   * Single-card price lookup by name + set name, for the deck builder.
   * Prefers the guessed slug and falls back to scanning the set's listing
   * pages, which costs one request per 20 cards.
   */
  async getPricing(cardName: string, setName: string): Promise<ItacaPricing | null> {
    const setSlug = await this.findExpansionSlug(setName);
    if (!setSlug) return null;

    let product = await this.fetchProduct(setSlug, slugify(cardName));

    if (!product || normalize(product.name) !== normalize(cardName)) {
      const target = normalize(cardName);
      let found: string | null = null;
      for await (const page of this.iterateExpansion(setSlug)) {
        const hit = page.products.find((p) => normalize(p.name) === target);
        if (hit?.slug) {
          found = hit.slug;
          break;
        }
      }
      product = found ? await this.fetchProduct(setSlug, found) : null;
    }
    if (!product) return null;

    const inStock = product.offers.filter((o) => o.inStock);
    return {
      ...product,
      inStock: inStock.length > 0,
      lowestPrice: inStock.length ? Math.min(...inStock.map((o) => o.price)) : null,
      currency: product.offers[0]?.currency ?? null,
    };
  }

  private async fetchProduct(setSlug: string, cardSlug: string): Promise<ItacaProduct | null> {
    const path = `/magic/products/singles/${setSlug}/${cardSlug}`;
    const res = await this.http.get(path);
    // Unknown slugs 302-redirect to /magic rather than returning 404.
    if (res.status !== 200 || res.redirected) return null;
    return parseProductPage(`${ITACA_BASE}${path}`, res.html);
  }
}
