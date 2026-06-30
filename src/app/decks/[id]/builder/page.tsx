import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BuilderView } from "@/components/decks/builder-view";
import type { DeckEntry } from "@/lib/commander";
import type { LibraryCard } from "@/components/decks/builder-view";

function toImageUrl(printings: { imageUris: unknown }[], faces: { imageUri: string | null }[]): string | null {
  const imageUris = printings[0]?.imageUris as Record<string, string> | null;
  return imageUris?.normal ?? imageUris?.small ?? faces[0]?.imageUri ?? null;
}

export default async function DeckBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [deck, libraryCards] = await Promise.all([
    prisma.deck.findUnique({
      where: { id },
      include: {
        themes: true,
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
    }),
    prisma.libraryCard.findMany({
      include: {
        card: {
          include: {
            printings: { take: 1, orderBy: { setCode: "desc" } },
            faces: { take: 1, orderBy: { faceIndex: "asc" } },
          },
        },
      },
      orderBy: { card: { name: "asc" } },
    }),
  ]);

  if (!deck) notFound();

  const entries: DeckEntry[] = deck.cards.map((dc) => ({
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
    imageUrl: toImageUrl(dc.card.printings, dc.card.faces),
  }));

  const library: LibraryCard[] = libraryCards.map((lc) => ({
    libraryCardId: lc.id,
    quantity: lc.quantity,
    cardId: lc.card.id,
    name: lc.card.name,
    manaCost: lc.card.manaCost,
    cmc: lc.card.cmc,
    typeLine: lc.card.typeLine,
    oracleText: lc.card.oracleText,
    colorIdentity: lc.card.colorIdentity,
    keywords: lc.card.keywords,
    canBeCommander: lc.card.canBeCommander,
    imageUrl: toImageUrl(lc.card.printings, lc.card.faces),
  }));

  return (
    <BuilderView
      deckId={id}
      deckName={deck.name}
      themes={deck.themes}
      maybeboardName={deck.maybeboardName ?? "Maybeboard"}
      initialEntries={entries}
      libraryCards={library}
    />
  );
}
