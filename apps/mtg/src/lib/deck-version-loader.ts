import "server-only";

import { prisma } from "@/lib/prisma";
import type { VersionSummary } from "@/lib/deck-api";

/**
 * PRECONDITION FOR EVERY FUNCTION IN THIS FILE: the caller has already
 * established that the signed-in user owns `deckId` (requireDeckAccess, or a
 * `findFirst({ where: { id, userId } })`). These check that versions belong to
 * THAT deck — which is what stops a versionId from another account's deck
 * riding in on a deck the caller owns — but not who owns the deck.
 */

/**
 * Which version of a deck should a page or handler read?
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

/** Every version of the deck, oldest first, with card counts and game records. */
export async function loadVersionSummaries(deckId: string): Promise<VersionSummary[]> {
  const [currentVersionId, versions] = await Promise.all([
    resolveVersionId(deckId),
    prisma.deckVersion.findMany({
      where: { deckId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        notes: true,
        parentVersionId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const versionIds = versions.map((v) => v.id);

  // Two grouped aggregates instead of per-version counts: one round trip each
  // however many versions the deck has.
  const [mainSums, resultCounts] = await Promise.all([
    prisma.deckCard.groupBy({
      by: ["versionId"],
      where: { versionId: { in: versionIds }, slot: "main" },
      _sum: { quantity: true },
    }),
    prisma.gameLog.groupBy({
      by: ["versionId", "result"],
      where: { versionId: { in: versionIds } },
      _count: { _all: true },
    }),
  ]);

  const mainCountById = new Map(mainSums.map((row) => [row.versionId, row._sum.quantity ?? 0]));

  const recordById = new Map<string, VersionSummary["record"]>();
  for (const row of resultCounts) {
    const record = recordById.get(row.versionId) ?? { games: 0, wins: 0, losses: 0, draws: 0 };
    const n = row._count._all;
    record.games += n;
    if (row.result === "WIN") record.wins += n;
    else if (row.result === "LOSS") record.losses += n;
    else if (row.result === "DRAW") record.draws += n;
    recordById.set(row.versionId, record);
  }

  return versions.map((v) => ({
    id: v.id,
    name: v.name,
    notes: v.notes,
    parentVersionId: v.parentVersionId,
    isCurrent: v.id === currentVersionId,
    mainCount: mainCountById.get(v.id) ?? 0,
    record: recordById.get(v.id) ?? { games: 0, wins: 0, losses: 0, draws: 0 },
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }));
}
