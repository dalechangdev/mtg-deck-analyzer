import type { StoreCatalogPage } from "@mtg/store-core";
import { supabase } from "./supabase";

/**
 * Writes one catalog-page snapshot and derives the change events from it.
 *
 * Stores give us snapshots ("15 in stock", or just "available"); users care
 * about transitions ("it came back"). Deriving events here is what turns
 * polling into alerting. We deliberately do NOT write a row per article per
 * poll: at any real scale that is tens of thousands of identical rows an hour
 * that answer no question a change log cannot.
 *
 * Written to be correct for stores that publish unit counts AND stores that
 * only publish availability. `quantity` may be null throughout; `in_stock`
 * never is. Anything that would need a count falls back to the availability
 * transition instead of inventing a number.
 */

export interface SyncStats {
  productsSeen: number;
  articlesSeen: number;
  articlesChanged: number;
}

type ArticleRow = {
  id: number;
  external_id: string;
  in_stock: boolean;
  quantity: number | null;
  price_cents: number;
  is_active: boolean;
};

type EventKind =
  | "appeared"
  | "back_in_stock"
  | "restock"
  | "decrease"
  | "sold_out"
  | "delisted"
  | "price_change";

type StockEvent = {
  article_id: number;
  kind: EventKind;
  in_stock: boolean;
  previous_in_stock: boolean | null;
  quantity: number | null;
  previous_quantity: number | null;
  price_cents: number;
  previous_price_cents: number | null;
};

export async function persistCatalogPage(
  page: StoreCatalogPage,
  storeId: number,
  groupId: number | null
): Promise<SyncStats> {
  const now = new Date().toISOString();

  if (page.products.length === 0) {
    return { productsSeen: 0, articlesSeen: 0, articlesChanged: 0 };
  }

  // --- products -----------------------------------------------------------
  const { data: products, error: productError } = await supabase
    .from("products")
    .upsert(
      page.products.map((p) => ({
        store_id: storeId,
        external_id: p.externalId,
        group_id: groupId,
        name: p.name,
        slug: p.groupSlug,
        url: p.url,
        image_url: p.imageUrl,
        last_seen_at: now,
        updated_at: now,
      })),
      { onConflict: "store_id,external_id" }
    )
    .select("id, external_id");

  if (productError) throw new Error(`product upsert failed: ${productError.message}`);

  const productIdByExternalId = new Map(
    (products ?? []).map((row) => [row.external_id as string, row.id as number])
  );

  // --- articles: read current state before overwriting it ------------------
  const { data: existingRows, error: existingError } = await supabase
    .from("articles")
    .select("id, external_id, in_stock, quantity, price_cents, is_active")
    .in("product_id", [...productIdByExternalId.values()]);

  if (existingError) throw new Error(`article read failed: ${existingError.message}`);

  const existing = new Map<string, ArticleRow>(
    (existingRows ?? []).map((r) => [r.external_id as string, r as ArticleRow])
  );

  const incoming = page.products.flatMap((p) =>
    p.offers.map((offer) => ({ product: p, offer }))
  );

  const upserts = incoming.map(({ product, offer }) => ({
    store_id: storeId,
    external_id: offer.externalId,
    product_id: productIdByExternalId.get(product.externalId)!,
    language: offer.language,
    condition: offer.condition,
    is_foil: offer.isFoil,
    // Availability is always known; the count may not be.
    in_stock: offer.quantity === null ? product.inStock : offer.quantity > 0,
    quantity: offer.quantity,
    price_cents: offer.priceCents,
    currency: offer.currency,
    is_active: true,
    last_seen_at: now,
    updated_at: now,
  }));

  let written: Array<{ id: number; external_id: string }> = [];
  if (upserts.length > 0) {
    const { data, error } = await supabase
      .from("articles")
      .upsert(upserts, { onConflict: "store_id,external_id" })
      .select("id, external_id");
    if (error) throw new Error(`article upsert failed: ${error.message}`);
    written = (data ?? []) as Array<{ id: number; external_id: string }>;
  }

  const articleIdByExternalId = new Map(written.map((r) => [r.external_id, r.id]));

  // --- derive events -------------------------------------------------------
  const events: StockEvent[] = [];

  for (const { product, offer } of incoming) {
    const dbId = articleIdByExternalId.get(offer.externalId);
    if (dbId === undefined) continue;

    const before = existing.get(offer.externalId);
    const nowInStock = offer.quantity === null ? product.inStock : offer.quantity > 0;

    if (!before || !before.is_active) {
      events.push({
        article_id: dbId,
        kind: "appeared",
        in_stock: nowInStock,
        previous_in_stock: before?.in_stock ?? null,
        quantity: offer.quantity,
        previous_quantity: before?.quantity ?? null,
        price_cents: offer.priceCents,
        previous_price_cents: before?.price_cents ?? null,
      });
      continue;
    }

    // Availability transitions are the events every store can support, so they
    // are checked first and independently of any count.
    if (nowInStock !== before.in_stock) {
      events.push({
        article_id: dbId,
        kind: nowInStock ? "back_in_stock" : "sold_out",
        in_stock: nowInStock,
        previous_in_stock: before.in_stock,
        quantity: offer.quantity,
        previous_quantity: before.quantity,
        price_cents: offer.priceCents,
        previous_price_cents: before.price_cents,
      });
    } else if (
      // A count that moved without crossing the in/out boundary. Only
      // meaningful where both readings are real numbers.
      offer.quantity !== null &&
      before.quantity !== null &&
      offer.quantity !== before.quantity
    ) {
      events.push({
        article_id: dbId,
        kind: offer.quantity > before.quantity ? "restock" : "decrease",
        in_stock: nowInStock,
        previous_in_stock: before.in_stock,
        quantity: offer.quantity,
        previous_quantity: before.quantity,
        price_cents: offer.priceCents,
        previous_price_cents: before.price_cents,
      });
    }

    // A price move is worth its own event even when stock is unchanged —
    // a "drops below €X" watch keys on exactly this.
    if (offer.priceCents !== before.price_cents) {
      events.push({
        article_id: dbId,
        kind: "price_change",
        in_stock: nowInStock,
        previous_in_stock: before.in_stock,
        quantity: offer.quantity,
        previous_quantity: before.quantity,
        price_cents: offer.priceCents,
        previous_price_cents: before.price_cents,
      });
    }
  }

  // --- articles that vanished from the page --------------------------------
  const seen = new Set(incoming.map(({ offer }) => offer.externalId));
  const vanished = [...existing.values()].filter((r) => r.is_active && !seen.has(r.external_id));

  if (vanished.length > 0) {
    const { error } = await supabase
      .from("articles")
      .update({ is_active: false, in_stock: false, quantity: null, updated_at: now })
      .in("id", vanished.map((r) => r.id));
    if (error) throw new Error(`delist update failed: ${error.message}`);

    for (const row of vanished) {
      events.push({
        article_id: row.id,
        kind: "delisted",
        in_stock: false,
        previous_in_stock: row.in_stock,
        quantity: null,
        previous_quantity: row.quantity,
        price_cents: row.price_cents,
        previous_price_cents: row.price_cents,
      });
    }
  }

  if (events.length > 0) {
    const { error } = await supabase.from("article_stock_events").insert(events);
    if (error) throw new Error(`event insert failed: ${error.message}`);
  }

  return {
    productsSeen: page.products.length,
    articlesSeen: incoming.length,
    articlesChanged: events.length,
  };
}
