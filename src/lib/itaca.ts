// Lightweight scraper for itaca.gg card pricing.
//
// itaca.gg has no JSON API — every page is server-rendered HTML. Its robots.txt
// disallows the search endpoints (/search/index, /search/card, /searchBuyList/index,
// /advancedSearch/search) but explicitly allows /magic/expansions and
// /magic/products/singles/*, with `Crawl-delay: 5`. This module only touches the
// allowed paths and paces multi-request lookups at 5s to respect that.
//
// Product pages embed a schema.org Product block as JSON-LD, which is the actual
// data source here — no HTML table parsing needed for pricing.

const ITACA_BASE = "https://itaca.gg";
const USER_AGENT = "mtg-deck-builder/1.0 (personal price lookup)";
const CRAWL_DELAY_MS = 5000;
const EXPANSIONS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SET_LISTING_PAGES = 25; // 20 cards/page — covers all Commander/Standard-sized sets

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(name: string): string {
  return name
    .replace(/['’]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(name: string): string {
  return normalize(name).replace(/\s+/g, "-");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

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

let expansionsCache: { expiresAt: number; bySlugName: Map<string, string> } | null = null;

async function fetchExpansions(): Promise<Map<string, string>> {
  if (expansionsCache && expansionsCache.expiresAt > Date.now()) {
    return expansionsCache.bySlugName;
  }
  const res = await fetch(`${ITACA_BASE}/magic/expansions`, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: EXPANSIONS_TTL_MS / 1000 },
  });
  const bySlugName = new Map<string, string>();
  if (res.ok) {
    const html = await res.text();
    const re = /href="\/magic\/products\/singles\/([a-z0-9-]+)"\s+title="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const [, slug, titleHtml] = m;
      bySlugName.set(normalize(decodeHtmlEntities(titleHtml)), slug);
    }
  }
  expansionsCache = { expiresAt: Date.now() + EXPANSIONS_TTL_MS, bySlugName };
  return bySlugName;
}

async function findExpansionSlug(setName: string): Promise<string | null> {
  const expansions = await fetchExpansions();
  const key = normalize(setName);
  if (expansions.has(key)) return expansions.get(key)!;
  for (const [name, slug] of expansions) {
    if (name.includes(key) || key.includes(name)) return slug;
  }
  return null;
}

function parseProductPage(url: string, html: string): ItacaProduct | null {
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
    // The site's own JSON-LD leaves HTML entities unescaped inside the JSON string values.
    name: decodeHtmlEntities(data.name),
    alternateName: data.alternateName ? decodeHtmlEntities(data.alternateName) : null,
    imageUrl: Array.isArray(data.image) ? data.image[0] ?? null : data.image ?? null,
    offers,
  };
}

async function fetchProduct(setSlug: string, cardSlug: string): Promise<ItacaProduct | null> {
  const path = `/magic/products/singles/${setSlug}/${cardSlug}`;
  const res = await fetch(`${ITACA_BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: EXPANSIONS_TTL_MS / 1000 },
  });
  // Unknown slugs 302-redirect to /magic instead of 404ing.
  if (!res.ok || res.redirected) return null;
  const html = await res.text();
  return parseProductPage(`${ITACA_BASE}${path}`, html);
}

async function fetchSetListingPage(setSlug: string, offset: number): Promise<Array<{ slug: string; name: string }>> {
  const res = await fetch(`${ITACA_BASE}/magic/products/singles/${setSlug}?max=20&offset=${offset}`, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: EXPANSIONS_TTL_MS / 1000 },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const re = new RegExp(
    `href="/magic/products/singles/${setSlug}/([a-z0-9-]+)(?:\\?[^"]*)?"[^>]*>\\s*([^<]+?)\\s*<`,
    "g"
  );
  const seen = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, slug, name] = m;
    if (!seen.has(slug)) seen.set(slug, decodeHtmlEntities(name.trim()));
  }
  return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
}

async function findCardSlugInSet(setSlug: string, cardName: string): Promise<string | null> {
  const target = normalize(cardName);
  for (let page = 0; page < MAX_SET_LISTING_PAGES; page++) {
    if (page > 0) await sleep(CRAWL_DELAY_MS);
    const listing = await fetchSetListingPage(setSlug, page * 20);
    if (listing.length === 0) break;
    const found = listing.find((c) => normalize(c.name) === target);
    if (found) return found.slug;
  }
  return null;
}

// Resolves pricing for a card by its (Scryfall) name and set name, staying within
// the paths itaca.gg's robots.txt allows. Falls back to paginating the set's
// listing page only when the guessed URL slug doesn't hit — most lookups resolve
// on the first request.
export async function getItacaPricing(cardName: string, setName: string): Promise<ItacaPricing | null> {
  const setSlug = await findExpansionSlug(setName);
  if (!setSlug) return null;

  let product = await fetchProduct(setSlug, slugify(cardName));

  if (!product || normalize(product.name) !== normalize(cardName)) {
    await sleep(CRAWL_DELAY_MS);
    const realSlug = await findCardSlugInSet(setSlug, cardName);
    product = realSlug ? await fetchProduct(setSlug, realSlug) : null;
  }
  if (!product) return null;

  const inStockOffers = product.offers.filter((o) => o.inStock);
  return {
    ...product,
    inStock: inStockOffers.length > 0,
    lowestPrice: inStockOffers.length > 0 ? Math.min(...inStockOffers.map((o) => o.price)) : null,
    currency: product.offers[0]?.currency ?? null,
  };
}
