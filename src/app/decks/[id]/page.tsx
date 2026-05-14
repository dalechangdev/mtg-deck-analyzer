import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DeckBuilder } from "@/components/decks/deck-builder";
import type { DeckEntry } from "@/lib/commander";

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const deck = await prisma.deck.findUnique({
    where: { id },
    include: {
      cards: {
        include: {
          card: {
            include: {
              printings: { take: 1, orderBy: { setCode: "desc" } },
              faces: { take: 1, orderBy: { faceIndex: "asc" } },
            },
          },
        },
        orderBy: [{ isCommander: "desc" }, { card: { name: "asc" } }],
      },
    },
  });

  if (!deck) notFound();

  const entries: DeckEntry[] = deck.cards.map((dc) => {
    const printing = dc.card.printings[0];
    const imageUris = printing?.imageUris as Record<string, string> | null;
    const imageUrl = imageUris?.normal ?? imageUris?.small ?? dc.card.faces[0]?.imageUri ?? null;

    return {
      deckCardId: dc.id,
      isCommander: dc.isCommander,
      quantity: dc.quantity,
      slot: (dc.slot ?? "main") as "main" | "maybe" | "wishlist",
      cardId: dc.card.id,
      name: dc.card.name,
      manaCost: dc.card.manaCost,
      typeLine: dc.card.typeLine,
      oracleText: dc.card.oracleText,
      colorIdentity: dc.card.colorIdentity,
      keywords: dc.card.keywords,
      canBeCommander: dc.card.canBeCommander,
      imageUrl,
    };
  });

  return (
    <DeckBuilder
      deckId={id}
      initialName={deck.name}
      initialEntries={entries}
      initialDescription={deck.description ?? ""}
      initialThemes={deck.themes ?? []}
      initialMaybeboardName={deck.maybeboardName ?? ""}
      initialWishlistName={deck.wishlistName ?? ""}
    />
  );
}
