import { requireUserIdOr401 } from "@/lib/auth";
import { isBasicLand, parseDecklist } from "@/lib/decklist";
import { priceCard, resolveLines, uniqueCards } from "@/lib/deck-pricing";
import type { PriceEvent } from "@/lib/price-events";

/** A pasted Commander deck is ~100 lines; this is room for that and some slack. */
const MAX_TEXT_LENGTH = 20_000;
/** A Commander deck plus room; each card may cost up to MAX_ATTEMPTS_PER_CARD 5s requests uncached. */
const MAX_CARDS = 150;

/**
 * Prices a pasted decklist on Ítaca, streaming NDJSON (`PriceEvent` per line)
 * so the page fills in as each card's 5s-paced lookups land. Signed-in only:
 * no user rows are touched, but it makes outbound requests on the server.
 */
export async function POST(request: Request) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { text?: unknown; skipBasics?: unknown }
    | null;
  if (typeof body?.text !== "string" || !body.text.trim()) {
    return Response.json({ error: "Paste a decklist" }, { status: 400 });
  }
  if (body.text.length > MAX_TEXT_LENGTH) {
    return Response.json({ error: "Decklist is too long" }, { status: 400 });
  }
  const skipBasics = body.skipBasics !== false;

  const parsed = parseDecklist(body.text);
  const kept = skipBasics ? parsed.lines.filter((l) => !isBasicLand(l.name)) : parsed.lines;
  if (kept.length === 0) {
    return Response.json({ error: "No cards found in that list" }, { status: 400 });
  }

  const lines = await resolveLines(kept);
  const cards = uniqueCards(lines);
  if (cards.length > MAX_CARDS) {
    return Response.json(
      { error: `That list has ${cards.length} different cards; the limit is ${MAX_CARDS}` },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PriceEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        send({
          type: "deck",
          lines,
          cards: cards.length,
          skippedBasics: parsed.lines.length - kept.length,
          unparsed: parsed.unparsed,
        });
        for (const card of cards) {
          // A closed tab stops spending the crawl budget.
          const result = await priceCard(card, request.signal);
          if (!result) return;
          send({ type: "price", result });
        }
        send({ type: "done" });
      } catch {
        // enqueue throws once the client has gone; nothing left to tell it.
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
