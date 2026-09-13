import {
  StoreHttp,
  type CatalogRoot,
  type RobotsPolicy,
  type StoreAdapter,
  type StoreCatalogPage,
  type StoreHttpOptions,
} from "@mtg/store-core";

/**
 * Metrópolis Center (metropolis-center.com) — Madrid game store selling MTG
 * singles, boosters, decks and accessories.
 *
 * Site facts verified on 2026-08-31; see README.md for the full comparison
 * against Ítaca. The parser is intentionally not written yet: which source to
 * read is still an open decision (their PrestaShop storefront vs. their
 * Cardmarket seller inventory, which has a sanctioned API). Everything that
 * does NOT depend on that choice — the robots policy, the pacing, the adapter
 * shape — is settled here.
 */

export const METROPOLIS_BASE = "https://metropolis-center.com";

/**
 * Pacing is set by BYTES, not by request count.
 *
 * metropolis-center.com does not publish a Crawl-delay — its robots.txt is the
 * stock PrestaShop file, which has none. That is permission to choose, not
 * permission to hammer.
 *
 * Its category pages weigh ~3.3MB, against Ítaca's ~200KB. Ítaca's published
 * 5s delay works out to ~40KB/s of origin load. Matching that byte rate against
 * a 3.3MB page means roughly 80s between requests, so 60s is already on the
 * fast side of byte-equivalent and is used as the floor here.
 *
 * Revisit this per page type: a product page is far smaller than a category
 * listing and can safely be polled more often.
 */
export const METROPOLIS_MIN_INTERVAL_MS = 60_000;

/**
 * Transcribed from the live robots.txt (PrestaShop default, no Crawl-delay).
 * Search endpoints are disallowed, as they are on Ítaca — so here too the
 * catalog must be reached by walking categories, never by querying search.
 */
export const METROPOLIS_ROBOTS: RobotsPolicy = {
  host: "metropolis-center.com",
  minIntervalMs: METROPOLIS_MIN_INTERVAL_MS,
  disallow: [
    "/es/buscar",
    "/es/carrito",
    "/es/iniciar-sesion",
    "/es/mi-cuenta",
    "/es/pedido",
  ],
  allow: ["/juegos-de-cartas", "/es/juegos-de-cartas"],
};

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(
      `${what} is not implemented yet: the Metropolis data source has not been ` +
        `chosen. See packages/metropolis/README.md.`
    );
    this.name = "NotImplementedError";
  }
}

export type MetropolisHttpOptions = Omit<StoreHttpOptions, "baseUrl" | "policy">;

export class MetropolisHttp extends StoreHttp {
  constructor(opts: MetropolisHttpOptions = {}) {
    super({
      ...opts,
      baseUrl: METROPOLIS_BASE,
      policy: METROPOLIS_ROBOTS,
      userAgent: opts.userAgent ?? "mtg-restock-bot/0.1 (+https://example.com/bot)",
    });
  }
}

export class MetropolisAdapter implements StoreAdapter {
  readonly slug = "metropolis";
  readonly displayName = "Metrópolis Center";
  readonly baseUrl = METROPOLIS_BASE;
  readonly minIntervalMs = METROPOLIS_MIN_INTERVAL_MS;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly opts: MetropolisHttpOptions = {}) {}

  async listCatalogRoots(): Promise<CatalogRoot[]> {
    throw new NotImplementedError("MetropolisAdapter.listCatalogRoots");
  }

  async fetchPage(_cursor: string): Promise<StoreCatalogPage> {
    throw new NotImplementedError("MetropolisAdapter.fetchPage");
  }
}
