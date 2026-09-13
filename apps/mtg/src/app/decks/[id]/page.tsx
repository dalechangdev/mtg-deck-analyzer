import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { DeckBuilder } from "@/components/decks/deck-builder";
import type { DeckEntry } from "@/lib/commander";

export default async function DeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const requestedStep = (await searchParams).step;

  const userId = await requireUserId();

  const [deck, allThemes] = await Promise.all([
    // findFirst, not findUnique: the deck must match the id AND the owner, so
    // another account's deck id resolves to notFound() rather than rendering.
    prisma.deck.findFirst({
      where: { id, userId },
      include: {
        themes: true,
        cards: {
          include: {
            card: {
              include: {
                printings: { take: 1, orderBy: { setCode: "desc" } },
                faces: { take: 1, orderBy: { faceIndex: "asc" } },
                libraryEntries: { where: { userId }, take: 1 },
              },
            },
          },
          orderBy: [{ isCommander: "desc" }, { card: { name: "asc" } }],
        },
      },
    }),
    prisma.deckTheme.findMany({ orderBy: { name: "asc" } }),
  ]);

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
      cmc: dc.card.cmc,
      typeLine: dc.card.typeLine,
      oracleText: dc.card.oracleText,
      colorIdentity: dc.card.colorIdentity,
      keywords: dc.card.keywords,
      canBeCommander: dc.card.canBeCommander,
      imageUrl,
      ownedQuantity: dc.card.libraryEntries[0]?.quantity ?? 0,
    };
  });

  return (
    <DeckBuilder
      deckId={id}
      initialName={deck.name}
      initialEntries={entries}
      initialDescription={deck.description ?? ""}
      initialThemeIds={deck.themes.map((t) => t.id)}
      allThemes={allThemes}
      initialMaybeboardName={deck.maybeboardName ?? ""}
      initialWishlistName={deck.wishlistName ?? ""}
      initialStep={
        requestedStep === "commander" || requestedStep === "potential"
          ? requestedStep
          : undefined
      }
    />
  );
}
