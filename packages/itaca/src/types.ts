/** Card condition codes as itaca.gg names them in /svg/card_condition/*.svg */
export type CardCondition = "NM" | "SP" | "MP" | "HP" | "PO" | "UNKNOWN";

/**
 * One purchasable SKU: a specific copy of a card in a specific language,
 * condition and finish. This is the row the store actually decrements when
 * someone buys, so it is the unit a restock alert should key on.
 */
export interface ItacaArticle {
  /** itaca's internal article id, e.g. "2076006057". Stable across polls. */
  articleId: string;
  /** Uppercase language name as itaca spells it, e.g. "ENGLISH", "SPANISH". */
  language: string;
  condition: CardCondition;
  isFoil: boolean;
  isSigned: boolean;
  isAltered: boolean;
  isOffer: boolean;
  isPreorder: boolean;
  /** Units on hand. This is the number a restock alert watches. */
  quantity: number;
  /** Integer cents to avoid float drift; itaca prices are EUR. */
  priceCents: number;
  currency: string;
}

/** A card as it appears on an expansion listing page, with its full SKU table. */
export interface ItacaListingProduct {
  /** itaca's internal product id, e.g. "880508". Stable across polls. */
  productId: string;
  name: string;
  alternateName: string | null;
  /** URL slug within the expansion, e.g. "improvisation-capstone". */
  slug: string | null;
  imageUrl: string | null;
  expansionSlug: string;
  /** Sum of all article quantities as the page reports it ("21 Artículos disponibles"). */
  totalAvailable: number;
  /** Cheapest in-stock article, or null when the card is sold out. */
  lowestPriceCents: number | null;
  currency: string | null;
  articles: ItacaArticle[];
}

export interface ItacaListingPage {
  expansionSlug: string;
  offset: number;
  products: ItacaListingProduct[];
  hasNextPage: boolean;
  nextOffset: number | null;
  /** ISO timestamp of when this snapshot was taken. */
  fetchedAt: string;
}

export interface ItacaExpansion {
  slug: string;
  name: string;
}

/* ---------- Product-page (JSON-LD) shapes, used for single-card lookups ---------- */

export interface ItacaOffer {
  price: number;
  currency: string;
  inStock: boolean;
  variant: string;
}

export interface ItacaProduct {
  url: string;
  name: string;
  alternateName: string | null;
  imageUrl: string | null;
  offers: ItacaOffer[];
}

export interface ItacaPricing extends ItacaProduct {
  inStock: boolean;
  lowestPrice: number | null;
  currency: string | null;
}
