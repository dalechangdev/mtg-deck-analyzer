import "server-only";

import { prisma } from "@/lib/prisma";
import { parseDecklist } from "@/lib/decklist";
import { resolveLines } from "@/lib/deck-pricing";
import { deckCardsFromLines, searchName, summarize, type PriceSnapshot } from "@/lib/price-summary";

/**
 * Saved /prices runs. Every query here takes the caller's userId — Prisma
 * bypasses RLS, so this filter is the only thing keeping one account's
 * history from another's (see src/lib/auth.ts).
 */

/** Newest runs kept per account; older ones are deleted on save. */
const KEEP_PER_USER = 50;

export async function saveSearch(
  userId: string,
  input: { text: string; skipBasics: boolean; status: "complete" | "stopped"; snapshot: PriceSnapshot }
): Promise<string> {
  const results = new Map(input.snapshot.results.map((r) => [r.key, r]));
  const summary = summarize(input.snapshot.lines, results);

  const { id } = await prisma.priceSearch.create({
    data: {
      userId,
      name: searchName(input.snapshot.lines),
      text: input.text,
      skipBasics: input.skipBasics,
      status: input.status,
      ...summary,
      result: input.snapshot,
    },
    select: { id: true },
  });

  const stale = await prisma.priceSearch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: KEEP_PER_USER,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.priceSearch.deleteMany({ where: { userId, id: { in: stale.map((s) => s.id) } } });
  }
  return id;
}

export function listSearches(userId: string) {
  return prisma.priceSearch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      totalCents: true,
      currency: true,
      pricedCards: true,
      totalCards: true,
      createdAt: true,
    },
  });
}

/** Null for a missing id and for another account's — the caller answers 404 either way. */
export async function getSearch(userId: string, id: string) {
  const row = await prisma.priceSearch.findFirst({ where: { id, userId } });
  if (!row) return null;
  return { ...row, snapshot: row.result as unknown as PriceSnapshot };
}

export async function deleteSearch(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.priceSearch.deleteMany({ where: { id, userId } });
  return count > 0;
}

/**
 * Creates a deck (with its v1) from a saved search, for analysis in /decks.
 * Built from the pasted text rather than the snapshot so basic lands come
 * along even when the search skipped them. Null when the search isn't the
 * caller's. Cards the database doesn't know are left out and named in `unknown`.
 */
export async function createDeckFromSearch(
  userId: string,
  id: string
): Promise<{ deckId: string; unknown: string[] } | null> {
  const search = await prisma.priceSearch.findFirst({
    where: { id, userId },
    select: { name: true, text: true, createdAt: true },
  });
  if (!search) return null;

  const { cards, unknown } = deckCardsFromLines(await resolveLines(parseDecklist(search.text).lines));

  // Same shape as POST /api/decks: the deck needs a version before
  // currentVersionId can point at it, so one transaction for both writes.
  const deck = await prisma.$transaction(async (tx) => {
    const created = await tx.deck.create({
      data: {
        userId,
        name: search.name,
        description: `Imported from a /prices search on ${search.createdAt.toISOString().slice(0, 10)}.`,
        versions: { create: { name: "v1", cards: { create: cards } } },
      },
      include: { versions: { select: { id: true } } },
    });
    return tx.deck.update({
      where: { id: created.id },
      data: { currentVersionId: created.versions[0].id },
      select: { id: true },
    });
  });

  return { deckId: deck.id, unknown };
}
