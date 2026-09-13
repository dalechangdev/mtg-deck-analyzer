/**
 * Parses an expansion listing page (/magic/products/singles/{slug}?max=20&offset=N).
 *
 * This is the highest-value endpoint for restock monitoring: a single request
 * returns 20 cards *and* their full SKU tables — language, condition, finish,
 * unit price and on-hand quantity. The per-card product page carries the same
 * pricing in JSON-LD but omits quantity, so watching stock levels through
 * product pages would cost 20x the requests and still miss the number that
 * matters.
 *
 * The page is server-rendered Spanish HTML with no JSON payload, so this is
 * regex extraction anchored on stable id attributes rather than CSS classes
 * where possible. `article-amount-{id}` is the most stable anchor on the page.
 */

import { decodeHtmlEntities, parsePriceCents, stripTags } from "@mtg/store-core";
import type {
  CardCondition,
  ItacaArticle,
  ItacaListingPage,
  ItacaListingProduct,
} from "./types";

const CONDITIONS = new Set(["NM", "SP", "MP", "HP", "PO"]);

/** Splits the page into per-card tiles. */
function splitTiles(html: string): string[] {
  const parts = html.split(/<div class="cajaproducto/);
  return parts.slice(1);
}

function parseCondition(rowHtml: string): CardCondition {
  const m = rowHtml.match(/\/svg\/card_condition\/([A-Za-z]+)\.svg/);
  const code = m?.[1]?.toUpperCase();
  return code && CONDITIONS.has(code) ? (code as CardCondition) : "UNKNOWN";
}

function parseFeature(rowHtml: string, feature: string): boolean {
  // Each feature renders as `{name}-on.svg` or `{name}-off.svg`.
  const m = rowHtml.match(new RegExp(`/svg/card_feature/${feature}-(on|off)\\.svg`));
  return m?.[1] === "on";
}

function parseLanguage(rowHtml: string): string {
  // The flag lives at /svg/{LANGUAGE}.svg — distinguish it from the condition
  // and feature icons, which sit in subdirectories.
  const m = rowHtml.match(/\/svg\/([A-Z_]+)\.svg/);
  return m?.[1] ?? "UNKNOWN";
}

function parseArticles(tileHtml: string): ItacaArticle[] {
  const start = tileHtml.indexOf("cajafilascartas");
  if (start === -1) return [];

  // Every SKU row is terminated by this marker in itaca's template.
  const rows = tileHtml.slice(start).split("<!-- esto marca el fin de bucle -->");
  const articles: ItacaArticle[] = [];

  for (const row of rows) {
    const amount = row.match(/id="article-amount-(\d+)"[^>]*>\s*([\d.,]+)\s*</);
    if (!amount) continue;

    const priceCell = row.match(/class="celdatabla[^"]*precio[^"]*"\s*>\s*([^<]+)</);
    const priceCents = priceCell ? parsePriceCents(priceCell[1]) : null;

    articles.push({
      articleId: amount[1],
      quantity: Number(amount[2].replace(/[.,]/g, "")),
      language: parseLanguage(row),
      condition: parseCondition(row),
      isFoil: parseFeature(row, "foil"),
      isSigned: parseFeature(row, "firmada"),
      isAltered: parseFeature(row, "alterada"),
      isOffer: parseFeature(row, "oferta"),
      isPreorder: parseFeature(row, "preorder"),
      priceCents: priceCents ?? 0,
      currency: "EUR",
    });
  }

  return articles;
}

function parseTile(tileHtml: string, expansionSlug: string): ItacaListingProduct | null {
  const productId =
    tileHtml.match(/\/img\/product\/magic-single\/(\d+)\./)?.[1] ??
    tileHtml.match(/trackProductShownAnalyticsEntry\("(\d+)"\)/)?.[1] ??
    null;
  if (!productId) return null;

  const nameCell = tileHtml.match(/<span class="titulocartacaja">([\s\S]*?)<\/span>/);
  const name = nameCell ? stripTags(nameCell[1]) : null;
  if (!name) return null;

  const subtitle = tileHtml.match(/<span class="subtitulocartacaja">([\s\S]*?)<\/span>/);
  const alternateName = subtitle ? stripTags(subtitle[1]) || null : null;

  const slug =
    tileHtml.match(
      new RegExp(`/magic/products/singles/${expansionSlug}/([a-z0-9-]+)`)
    )?.[1] ?? null;

  const imageUrl =
    tileHtml.match(/<img src="(https?:\/\/[^"]*\/magic-single\/\d+\.[a-z]+)"/)?.[1] ?? null;

  const totalCell = tileHtml.match(
    /<span class="titulocajacaracteristicas">\s*([\d.,]+)\s*Art/
  );

  const articles = parseArticles(tileHtml);
  const inStockPrices = articles.filter((a) => a.quantity > 0 && a.priceCents > 0);

  return {
    productId,
    name,
    // itaca repeats the name as the subtitle when there is no alternate name.
    alternateName: alternateName && alternateName !== name ? alternateName : null,
    slug,
    imageUrl,
    expansionSlug,
    totalAvailable: totalCell
      ? Number(totalCell[1].replace(/[.,]/g, ""))
      : articles.reduce((sum, a) => sum + a.quantity, 0),
    lowestPriceCents: inStockPrices.length
      ? Math.min(...inStockPrices.map((a) => a.priceCents))
      : null,
    currency: articles.length ? articles[0].currency : null,
    articles,
  };
}

export function parseListingPage(
  html: string,
  expansionSlug: string,
  offset: number
): ItacaListingPage {
  const products = splitTiles(html)
    .map((tile) => parseTile(tile, expansionSlug))
    .filter((p): p is ItacaListingProduct => p !== null);

  // The pager renders a next-arrow link only while more pages exist; there is
  // no total count anywhere on the page, so this is the only end-of-set signal.
  const nextMatch = html.match(
    new RegExp(
      `/magic/products/singles/${expansionSlug}\\?max=(\\d+)&(?:amp;)?offset=(\\d+)`
    )
  );
  const nextOffset =
    nextMatch && Number(nextMatch[2]) > offset ? Number(nextMatch[2]) : null;

  return {
    expansionSlug,
    offset,
    products,
    hasNextPage: nextOffset !== null,
    nextOffset,
    fetchedAt: new Date().toISOString(),
  };
}

export function parseExpansionsIndex(html: string): Array<{ slug: string; name: string }> {
  const re = /href="\/magic\/products\/singles\/([a-z0-9-]+)"\s+title="([^"]+)"/g;
  const bySlug = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!bySlug.has(m[1])) bySlug.set(m[1], decodeHtmlEntities(m[2]));
  }
  return [...bySlug.entries()].map(([slug, name]) => ({ slug, name }));
}
