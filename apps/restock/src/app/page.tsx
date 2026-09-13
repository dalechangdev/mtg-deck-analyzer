import { createClient } from "@/lib/supabase/server";

/**
 * Recent restocks across every tracked store.
 *
 * Reads the change log rather than the articles table: "what came back" is a
 * question about transitions, and `article_stock_events` is the only place that
 * records them. RLS restricts this to signed-in users.
 */
export default async function HomePage() {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Restock alerts</h1>
        <p className="mt-3 text-muted">
          Sign in to track cards and get told the moment they are back in stock.
        </p>
      </section>
    );
  }

  const { data: events, error } = await supabase
    .from("article_stock_events")
    .select(
      "observed_at, quantity, price_cents, articles(products(name, stores(name)))"
    )
    // `back_in_stock` is the availability transition every store can report;
    // `restock` only fires for stores that publish unit counts.
    .in("kind", ["back_in_stock", "restock", "appeared"])
    .order("observed_at", { ascending: false })
    .limit(25);

  if (error) {
    return <p className="text-muted">Could not load restocks: {error.message}</p>;
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Recent restocks</h1>
      {events?.length ? (
        <ul className="mt-6 divide-y divide-border">
          {events.map((e, i) => (
            <li key={i} className="flex items-baseline justify-between gap-4 py-3">
              <span>
                {productName(e) ?? "Unknown card"}
                {storeName(e) ? (
                  <span className="ml-2 text-sm text-muted">{storeName(e)}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-sm text-muted">
                {/* Not every store publishes unit counts, so say "in stock"
                    rather than inventing a number. */}
                {e.quantity === null ? "in stock" : `${e.quantity} in stock`} ·{" "}
                {(e.price_cents / 100).toFixed(2)} €
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-muted">Nothing has come back in stock yet.</p>
      )}
    </section>
  );
}

/** PostgREST types every embed as an array, even for a to-one relationship. */
function first<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

type Nested = {
  articles?: unknown;
};

function product(event: Nested): { name?: string | null; stores?: unknown } | undefined {
  const article = first(event.articles) as { products?: unknown } | undefined;
  return first(article?.products) as { name?: string | null; stores?: unknown } | undefined;
}

function productName(event: Nested): string | null {
  return product(event)?.name ?? null;
}

function storeName(event: Nested): string | null {
  const store = first(product(event)?.stores) as { name?: string | null } | undefined;
  return store?.name ?? null;
}
