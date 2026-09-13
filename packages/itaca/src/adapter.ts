import type {
  CatalogRoot,
  StoreAdapter,
  StoreCatalogPage,
  StoreOffer,
  StoreProduct,
} from "@mtg/store-core";
import { ItacaClient, type ItacaClientOptions } from "./client";
import { CRAWL_DELAY_MS, ITACA_BASE } from "./http";
import type { ItacaListingProduct } from "./types";

/**
 * Ítaca behind the generic StoreAdapter interface, so the scheduler and the
 * persistence layer can treat it identically to any other shop.
 *
 * The cursor encodes `{setSlug}:{offset}`. Page size is fixed at 20 by the
 * server — the `max` query parameter is ignored — so offsets always step by 20.
 */
export class ItacaAdapter implements StoreAdapter {
  readonly slug = "itaca";
  readonly displayName = "Ítaca";
  readonly baseUrl = ITACA_BASE;
  readonly minIntervalMs = CRAWL_DELAY_MS;

  private readonly client: ItacaClient;

  constructor(opts: ItacaClientOptions = {}) {
    this.client = new ItacaClient(opts);
  }

  async listCatalogRoots(): Promise<CatalogRoot[]> {
    const expansions = await this.client.listExpansions();
    return expansions.map((e) => ({ cursor: `${e.slug}:0`, label: e.name }));
  }

  async fetchPage(cursor: string): Promise<StoreCatalogPage> {
    const { slug, offset } = parseCursor(cursor);
    const page = await this.client.getListingPage(slug, offset);

    return {
      storeSlug: this.slug,
      cursor,
      products: page.products.map((p) => toStoreProduct(p, slug)),
      nextCursor:
        page.hasNextPage && page.nextOffset !== null ? `${slug}:${page.nextOffset}` : null,
      fetchedAt: page.fetchedAt,
    };
  }
}

function parseCursor(cursor: string): { slug: string; offset: number } {
  const idx = cursor.lastIndexOf(":");
  if (idx === -1) return { slug: cursor, offset: 0 };
  return { slug: cursor.slice(0, idx), offset: Number(cursor.slice(idx + 1)) || 0 };
}

function toStoreProduct(p: ItacaListingProduct, setSlug: string): StoreProduct {
  const offers: StoreOffer[] = p.articles.map((a) => ({
    externalId: a.articleId,
    language: a.language,
    condition: a.condition,
    isFoil: a.isFoil,
    // Ítaca publishes exact counts, so this is never null for this store.
    quantity: a.quantity,
    priceCents: a.priceCents,
    currency: a.currency,
  }));

  return {
    externalId: p.productId,
    name: p.name,
    setName: null, // The listing page names the set once, not per tile.
    groupSlug: setSlug,
    url: p.slug ? `${ITACA_BASE}/magic/products/singles/${setSlug}/${p.slug}` : null,
    imageUrl: p.imageUrl,
    inStock: p.totalAvailable > 0,
    lowestPriceCents: p.lowestPriceCents,
    currency: p.currency,
    offers,
  };
}
