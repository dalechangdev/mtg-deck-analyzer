import "server-only";

import { prisma } from "@/lib/prisma";
import { toImageUrl } from "@/lib/card-detail";
import type { CardData } from "@/lib/commander";

// Saved commanders (docs/plans/saved-commanders.md). The /commanders page, the
// GET route and the commander picker's quick picks all read through here.

export type SavedCommanderView = {
  id: string;
  note: string | null;
  createdAt: string;
  card: CardData;
  artUrl: string | null;
  /** The user's decks whose current version leads with this commander. Computed, never stored. */
  decks: { id: string; name: string }[];
};

/** Newest first. `userId` is required: Prisma bypasses RLS, so this filter is the boundary. */
export async function loadSavedCommanders(
  userId: string,
  opts: { cardId?: string; withDecks?: boolean } = {}
): Promise<SavedCommanderView[]> {
  const rows = await prisma.savedCommander.findMany({
    where: { userId, ...(opts.cardId && { cardId: opts.cardId }) },
    orderBy: { createdAt: "desc" },
    include: {
      card: {
        include: {
          printings: { take: 1, orderBy: { setCode: "desc" } },
          faces: { take: 1, orderBy: { faceIndex: "asc" } },
        },
      },
    },
  });

  const decksByCard = new Map<string, { id: string; name: string }[]>();
  if (opts.withDecks && rows.length) {
    const decks = await prisma.deck.findMany({
      where: {
        userId,
        currentVersion: {
          cards: { some: { isCommander: true, cardId: { in: rows.map((r) => r.cardId) } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        currentVersion: { select: { cards: { where: { isCommander: true }, select: { cardId: true } } } },
      },
    });
    for (const deck of decks) {
      // Partner decks have two commanders, so a deck can count for either one.
      for (const { cardId } of deck.currentVersion?.cards ?? []) {
        const list = decksByCard.get(cardId) ?? [];
        list.push({ id: deck.id, name: deck.name });
        decksByCard.set(cardId, list);
      }
    }
  }

  return rows.map((row) => {
    const { card } = row;
    const uris = card.printings[0]?.imageUris as Record<string, string> | null;
    return {
      id: row.id,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      card: {
        cardId: card.id,
        name: card.name,
        manaCost: card.manaCost,
        cmc: card.cmc,
        typeLine: card.typeLine,
        oracleText: card.oracleText,
        colorIdentity: card.colorIdentity,
        keywords: card.keywords,
        canBeCommander: card.canBeCommander,
        imageUrl: toImageUrl(card.printings, card.faces),
      },
      artUrl: uris?.art_crop ?? toImageUrl(card.printings, card.faces),
      decks: decksByCard.get(card.id) ?? [],
    };
  });
}
