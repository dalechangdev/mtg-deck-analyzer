import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Which version of a deck should a page or handler read?
 *
 * PRECONDITION: the caller has already established that the signed-in user owns
 * `deckId` (requireDeckAccess, or a `findFirst({ where: { id, userId } })`).
 * This function checks that a requested version belongs to THAT deck, which is
 * what stops a versionId from another account's deck riding in on a deck the
 * caller owns — but it does not check who owns the deck.
 *
 * An explicit request that isn't a version of this deck resolves to null (the
 * caller answers 404) rather than silently showing the current version.
 */
export async function resolveVersionId(
  deckId: string,
  requested?: string | null
): Promise<string | null> {
  if (requested) {
    const version = await prisma.deckVersion.findFirst({
      where: { id: requested, deckId },
      select: { id: true },
    });
    return version?.id ?? null;
  }

  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { currentVersionId: true },
  });
  if (deck?.currentVersionId) return deck.currentVersionId;

  // currentVersionId is SET NULL when that version is deleted. Every deck has at
  // least one version (the migration backfilled v1; POST /api/decks creates it),
  // so fall back to the newest rather than failing.
  const latest = await prisma.deckVersion.findFirst({
    where: { deckId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}
