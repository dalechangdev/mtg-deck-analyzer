/**
 * Store-agnostic vocabulary.
 *
 * Two shops model their inventory very differently — Ítaca exposes a per-SKU
 * table with exact unit counts, Metropolis (PrestaShop) exposes an in/out-of-
 * stock button and, on many pages, no count at all. The types here are the
 * intersection that a restock alert actually needs, with the differences made
 * explicit rather than averaged away.
 */

/** Condition codes normalised across stores; UNKNOWN when a store omits it. */
export type Condition = "NM" | "SP" | "MP" | "HP" | "PO" | "UNKNOWN";

/**
 * One purchasable line item.
 *
 * `quantity` is deliberately nullable: some stores publish exact counts and
 * some only publish availability. A null means "in stock, count unknown" —
 * never coerce it to 0 or 1, because "is it back?" and "how many are left?"
 * are different questions and only the first can be answered everywhere.
 */
export interface StoreOffer {
  /** The store's own id for this line item. Stable across polls. */
  externalId: string;
  language: string | null;
  condition: Condition;
  isFoil: boolean;
  quantity: number | null;
  priceCents: number;
  currency: string;
}

export interface StoreProduct {
  /** The store's own product id. */
  externalId: string;
  name: string;
  /** Expansion/set name where the store exposes one. */
  setName: string | null;
  /** Category path or set slug — whatever the store groups products by. */
  groupSlug: string | null;
  url: string | null;
  imageUrl: string | null;
  inStock: boolean;
  lowestPriceCents: number | null;
  currency: string | null;
  offers: StoreOffer[];
}

/**
 * One unit of crawl work and its result.
 *
 * `cursor` is an opaque string the adapter defines and the scheduler stores.
 * For Ítaca it encodes `{setSlug}:{offset}`; another store might encode a
 * category id and page number. Keeping it opaque is what lets one
 * `crawl_targets` table schedule stores whose pagination has nothing in common.
 */
export interface StoreCatalogPage {
  storeSlug: string;
  cursor: string;
  products: StoreProduct[];
  nextCursor: string | null;
  fetchedAt: string;
}

/** A root unit of work to seed the scheduler with (a set, a category, …). */
export interface CatalogRoot {
  cursor: string;
  label: string;
}

export interface StoreAdapter {
  /** Stable key used as `stores.slug` in the database. */
  readonly slug: string;
  readonly displayName: string;
  readonly baseUrl: string;

  /**
   * Minimum spacing between requests to this store, in milliseconds.
   * Taken from the store's robots.txt where it publishes a Crawl-delay, and
   * chosen conservatively where it does not.
   */
  readonly minIntervalMs: number;

  /** Enumerates the top-level units of work; called rarely (seeding, new sets). */
  listCatalogRoots(): Promise<CatalogRoot[]>;

  /** Fetches and parses one page of the catalog. */
  fetchPage(cursor: string): Promise<StoreCatalogPage>;
}
