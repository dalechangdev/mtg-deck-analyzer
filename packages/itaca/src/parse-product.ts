/**
 * Parses a single product page via its schema.org JSON-LD block.
 *
 * Kept for the deck-builder's one-off price lookups. Note that JSON-LD exposes
 * price and availability but *not* quantity — use the listing parser when you
 * need stock levels.
 */

import { decodeHtmlEntities } from "@mtg/store-core";
import type { ItacaOffer, ItacaProduct } from "./types";

export function parseProductPage(url: string, html: string): ItacaProduct | null {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;

  let data: {
    "@type"?: string;
    name?: string;
    alternateName?: string;
    image?: string[] | string;
    offers?: Array<{ price: string; priceCurrency: string; availability: string; name: string }>;
  };
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (data["@type"] !== "Product" || !data.name) return null;

  const rawOffers = Array.isArray(data.offers) ? data.offers : data.offers ? [data.offers] : [];
  const offers: ItacaOffer[] = rawOffers.map((o) => ({
    price: parseFloat(o.price),
    currency: o.priceCurrency,
    inStock: o.availability === "https://schema.org/InStock",
    variant: o.name ?? "Normal",
  }));

  return {
    url,
    // The site's own JSON-LD leaves HTML entities unescaped inside JSON strings.
    name: decodeHtmlEntities(data.name),
    alternateName: data.alternateName ? decodeHtmlEntities(data.alternateName) : null,
    imageUrl: Array.isArray(data.image) ? data.image[0] ?? null : data.image ?? null,
    offers,
  };
}
