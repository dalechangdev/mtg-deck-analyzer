import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SacrificeView } from "@/components/decks/sacrifice-view";
import type { DeckEntry } from "@/lib/commander";
import type { CardDetail } from "@/components/cards/card-detail-modal";

type ImageUris = { small?: string; normal?: string; large?: string; png?: string };

function toImageUrl(printings: { imageUris: unknown }[], faces: { imageUri: string | null }[]): string | null {
  const uris = printings[0]?.imageUris as ImageUris | null;
  return uris?.normal ?? uris?.small ?? faces[0]?.imageUri ?? null;
}

function toLargeImageUrl(printings: { imageUris: unknown }[], faces: { imageUri: string | null }[]): string | null {
  const uris = printings[0]?.imageUris as ImageUris | null;
  return uris?.large ?? uris?.png ?? uris?.normal ?? uris?.small ?? faces[0]?.imageUri ?? null;
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
              faces: { orderBy: { faceIndex: "asc" } },
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

  const cardDetails: Record<string, CardDetail> = Object.fromEntries(
    deck.cards.map((dc) => {
      const printing = dc.card.printings[0];
      const detail: CardDetail = {
        id: dc.card.id,
        name: dc.card.name,
        manaCost: dc.card.manaCost,
        cmc: dc.card.cmc,
        typeLine: dc.card.typeLine,
        oracleText: dc.card.oracleText,
        colorIdentity: dc.card.colorIdentity,
        keywords: dc.card.keywords,
        power: dc.card.power,
        toughness: dc.card.toughness,
        loyalty: dc.card.loyalty,
        canBeCommander: dc.card.canBeCommander,
        imageUrl: toImageUrl(dc.card.printings, dc.card.faces),
        largeImageUrl: toLargeImageUrl(dc.card.printings, dc.card.faces),
        setName: printing?.setName ?? null,
        setCode: printing?.setCode ?? null,
        rarity: printing?.rarity ?? null,
        collectorNumber: printing?.collectorNumber ?? null,
        scryfallUri: printing?.scryfallUri ?? null,
        faces: dc.card.faces.map((f) => ({
          name: f.name,
          manaCost: f.manaCost,
          typeLine: f.typeLine,
          oracleText: f.oracleText,
          power: f.power,
          toughness: f.toughness,
          loyalty: f.loyalty,
          imageUrl: f.imageUri,
        })),
      };
      return [dc.card.id, detail];
    })
  );

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
      cardDetails={cardDetails}
      initialRoles={initialRoles}
    />
  );
}
