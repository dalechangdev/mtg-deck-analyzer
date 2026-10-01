/**
 * Wire format of `POST /api/prices/decklist`: newline-delimited JSON, one
 * PriceEvent per line. Types only, so the client component can import it.
 */

import type { DeckBoard } from "@/lib/decklist";

export type PricedLine = {
  quantity: number;
  /** Scryfall's name when the card resolved, otherwise the name as pasted. */
  name: string;
  board: DeckBoard;
  /** The card's oracle id; every line of the same card shares one CardPrice. Null when the card is unknown. */
  key: string | null;
  /** Set code the list named, if any (`cmm`). */
  namedSetCode: string | null;
};

/** One Ítaca product page: this card in one printing's set. */
export type PrintingAttempt = {
  setCode: string;
  setName: string;
  status: "found" | "not_found" | "error";
  inStock: boolean;
  /** Cheapest in-stock offer; null when sold out or not found. */
  lowestPriceCents: number | null;
  currency: string | null;
  url: string | null;
  fetchedAt: string;
  cached: boolean;
};

export type CardPrice = {
  key: string;
  /** in_stock: `best` is the cheapest in-stock copy. sold_out: listed, nothing in stock. */
  status: "in_stock" | "sold_out" | "not_found" | "error";
  best: PrintingAttempt | null;
  /** Every printing checked, in the order tried. */
  attempts: PrintingAttempt[];
};

export type PriceEvent =
  | {
      type: "deck";
      lines: PricedLine[];
      /** Distinct cards to price; one `price` event follows for each. */
      cards: number;
      skippedBasics: number;
      unparsed: string[];
    }
  /**
   * The server has started on this card. `attempt` is the printing about to be
   * requested from Ítaca (1-based) of `of` candidates; 0 while it is still
   * listing printings.
   */
  | { type: "checking"; key: string; attempt: number; of: number }
  | { type: "price"; result: CardPrice }
  /** `searchId` is the saved PriceSearch, or null if saving failed. */
  | { type: "done"; searchId: string | null };
