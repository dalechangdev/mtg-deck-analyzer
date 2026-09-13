import "server-only";

import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth";

/**
 * Ownership gate for the deck-scoped Route Handlers.
 *
 * Prisma is not filtered by RLS (see prisma/migrations/*_add_ownership_and_rls),
 * so "does this deck belong to the caller" has to be asked explicitly, once, at
 * the top of every handler that takes a deck id from the URL. Without it, any
 * signed-in user can edit any deck by guessing an id.
 *
 * A deck that exists but belongs to somebody else answers 404, not 403:
 * a 403 confirms the id is real, which is an enumeration oracle.
 */
type Gate =
  | { userId: string; response?: never }
  | { userId?: never; response: Response };

export async function requireDeckAccess(deckId: string): Promise<Gate> {
  const userId = await getUserId();
  if (!userId) {
    return { response: Response.json({ error: "Not signed in" }, { status: 401 }) };
  }

  const owned = await prisma.deck.count({ where: { id: deckId, userId } });
  if (owned !== 1) {
    return { response: Response.json({ error: "Not found" }, { status: 404 }) };
  }

  return { userId };
}

/**
 * Same, for a template. Shared reference templates (ownerId null) are readable
 * by anyone but writable by no one, so `mode` says which question to ask.
 */
export async function requireTemplateAccess(
  templateId: string,
  mode: "read" | "write"
): Promise<Gate> {
  const userId = await getUserId();
  if (!userId) {
    return { response: Response.json({ error: "Not signed in" }, { status: 401 }) };
  }

  const visible = await prisma.analysisTemplate.count({
    where:
      mode === "write"
        ? { id: templateId, ownerId: userId }
        : { id: templateId, OR: [{ ownerId: userId }, { ownerId: null }] },
  });
  if (visible !== 1) {
    return { response: Response.json({ error: "Not found" }, { status: 404 }) };
  }

  return { userId };
}
