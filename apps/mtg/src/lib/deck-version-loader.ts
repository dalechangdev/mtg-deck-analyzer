import "server-only";

import { prisma } from "@/lib/prisma";
import type { VersionSummary } from "@/lib/deck-api";
import { evaluateTemplate } from "@/lib/deck-template";
import { loadDeckCards, loadRoleOverrides, loadTemplate } from "@/lib/deck-template-loader";
import { diffVersions, versionStats, type VersionComparison } from "@/lib/deck-version";

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

export type ComparePair =
  | { ok: true; a: string; b: string }
  | { ok: false; reason: "not-found" | "nothing-to-compare" };

/**
 * Which two versions does a compare request mean?
 *
 * `a` is the version under inspection (default: current). `b` is its baseline:
 * as requested, else a's parent if that still exists, else the newest other
 * version. A requested id that isn't this deck's is "not-found"; a deck with a
 * single version has "nothing-to-compare".
 */
export async function resolveComparePair(
  deckId: string,
  aRequested?: string | null,
  bRequested?: string | null
): Promise<ComparePair> {
  const a = await resolveVersionId(deckId, aRequested);
  if (!a) return { ok: false, reason: "not-found" };

  if (bRequested) {
    const b = await resolveVersionId(deckId, bRequested);
    return b ? { ok: true, a, b } : { ok: false, reason: "not-found" };
  }

  const [others, version] = await Promise.all([
    prisma.deckVersion.findMany({
      where: { deckId, id: { not: a } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.deckVersion.findUnique({ where: { id: a }, select: { parentVersionId: true } }),
  ]);
  if (others.length === 0) return { ok: false, reason: "nothing-to-compare" };

  const b = others.find((v) => v.id === version?.parentVersionId)?.id ?? others[0].id;
  return { ok: true, a, b };
}

/**
 * Everything the compare page shows, for two versions already resolved to this
 * deck by resolveComparePair.
 *
 * Both sides are scored against the same template with the deck's role
 * overrides, so the only thing allowed to differ between them is the cards.
 * Null when the template doesn't exist or isn't visible to `viewerId`.
 */
export async function loadVersionComparison(
  deckId: string,
  aId: string,
  bId: string,
  templateId: string,
  viewerId: string
): Promise<VersionComparison | null> {
  const [versions, template, overrides, aCards, bCards] = await Promise.all([
    loadVersionSummaries(deckId),
    loadTemplate(templateId, viewerId),
    loadRoleOverrides(deckId),
    loadDeckCards(aId),
    loadDeckCards(bId),
  ]);
  if (!template) return null;

  const aSummary = versions.find((v) => v.id === aId);
  const bSummary = versions.find((v) => v.id === bId);
  // Deleted between resolving the pair and loading it.
  if (!aSummary || !bSummary) return null;

  return {
    versions,
    a: {
      summary: aSummary,
      stats: versionStats(aCards),
      analysis: evaluateTemplate(aCards, template, overrides),
    },
    b: {
      summary: bSummary,
      stats: versionStats(bCards),
      analysis: evaluateTemplate(bCards, template, overrides),
    },
    diff: diffVersions(bCards, aCards),
  };
}
