import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SacrificeView } from "@/components/decks/sacrifice-view";
import type { DeckEntry } from "@/lib/commander";

function toImageUrl(
  printings: { imageUris: unknown }[],
  faces: { imageUri: string | null }[]
): string | null {
  const uris = printings[0]?.imageUris as Record<string, string> | null;
  return uris?.normal ?? uris?.small ?? faces[0]?.imageUri ?? null;
}

export default async function SacrificePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
              themes: {
                where: { id: { in: ["sacrifice-outlet", "sacrifice-payoff"] } },
                select: { id: true },
              },
            },
          },
        },
        orderBy: [{ isCommander: "desc" }, { card: { name: "asc" } }],
      },
    },
  });

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

  const initialRoles: Record<string, ("sacrifice-outlet" | "sacrifice-payoff")[]> =
    Object.fromEntries(
      deck.cards.map((dc) => [
        dc.card.id,
        dc.card.themes.map((t) => t.id as "sacrifice-outlet" | "sacrifice-payoff"),
      ])
    );

  return (
    <SacrificeView
      deckId={id}
      deckName={deck.name}
      entries={entries}
      initialRoles={initialRoles}
    />
  );
}
