import type { StoreAdapter } from "@mtg/store-core";
import { ItacaAdapter } from "@mtg/itaca";
import { MetropolisAdapter } from "@mtg/metropolis";
import { SupabaseRateLimiter } from "./rate-limiter";

/**
 * Adapter registry, keyed by `stores.slug`.
 *
 * Each adapter gets its own rate limiter bound to its own host bucket. They
 * must not share one: Ítaca's published 5s crawl delay is a statement about
 * Ítaca, and applying it to Metrópolis — whose pages are 16x heavier and which
 * publishes no delay at all — would be a decision nobody made on purpose.
 */

const USER_AGENT =
  process.env.CRAWLER_USER_AGENT ??
  "mtg-restock-bot/0.1 (+https://example.com/bot; restock alerts)";

function build(): Map<string, StoreAdapter> {
  const registry = new Map<string, StoreAdapter>();

  registry.set(
    "itaca",
    new ItacaAdapter({
      userAgent: USER_AGENT,
      rateLimiter: new SupabaseRateLimiter("itaca.gg", 5, Number(process.env.CRAWL_DAILY_CAP ?? 15_000)),
    })
  );

  // Registered but not yet functional — its parser is pending a decision on the
  // data source. It will throw NotImplementedError if the scheduler reaches it,
  // which is why `stores.is_active` should stay false for it until then.
  registry.set(
    "metropolis",
    new MetropolisAdapter({
      userAgent: USER_AGENT,
      rateLimiter: new SupabaseRateLimiter("metropolis-center.com", 60, 1_000),
    })
  );

  return registry;
}

export const adapters = build();

export function getAdapter(slug: string): StoreAdapter {
  const adapter = adapters.get(slug);
  if (!adapter) throw new Error(`No adapter registered for store "${slug}"`);
  return adapter;
}
