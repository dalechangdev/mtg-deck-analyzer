import "server-only";

import { prisma } from "@/lib/prisma";
import { searchName, summarize, type PriceSnapshot } from "@/lib/price-summary";

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
