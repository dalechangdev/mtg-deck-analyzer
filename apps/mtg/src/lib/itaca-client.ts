import { ItacaClient } from "@mtg/itaca";

/**
 * One client per process so the 5s crawl-delay is shared across requests.
 * A per-request client would let N concurrent lookups each start their own
 * interval and burst N requests at the store.
 */
const globalForItaca = globalThis as unknown as { itaca: ItacaClient };

export const itaca =
  globalForItaca.itaca ??
  new ItacaClient({
    userAgent: "mtg-deck-builder/1.0 (personal price lookup)",
  });

if (process.env.NODE_ENV !== "production") globalForItaca.itaca = itaca;
