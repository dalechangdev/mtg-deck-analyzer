import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SacrificeView } from "@/components/decks/sacrifice-view";
import { SacrificeThemeGate } from "@/components/decks/sacrifice-theme-gate";
import type { DeckEntry } from "@/lib/commander";
import { isColorSubset } from "@/lib/commander";
import type { CardDetail } from "@/components/cards/card-detail-modal";
import { toCardDetail, toImageUrl } from "@/lib/card-detail";
import type { LibraryCard } from "@/components/decks/builder-view";

type SacrificeRole = "sacrifice-outlet" | "sacrifice-payoff";
const SACRIFICE_ROLE_IDS: string[] = ["sacrifice-outlet", "sacrifice-payoff"];

export default async function SacrificePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const deck = await prisma.deck.findUnique({
    where: { id },
    include: {
      themes: { select: { id: true } },
      cards: {
        include: {
          card: {
            include: {
              printings: { take: 1, orderBy: { setCode: "desc" } },
              faces: { orderBy: { faceIndex: "asc" } },
              themes: {
                where: { id: { in: SACRIFICE_ROLE_IDS } },
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

  const hasSacrificeTheme = deck.themes.some(
    (t) => t.id === "sacrifice" || t.id === "aristocrats"
  );
  if (!hasSacrificeTheme) return <SacrificeThemeGate deckId={id} />;

  const libraryRows = await prisma.libraryCard.findMany({
    include: {
      card: {
        include: {
          printings: { take: 1, orderBy: { setCode: "desc" } },
          faces: { orderBy: { faceIndex: "asc" } },
          themes: {
            where: { id: { in: SACRIFICE_ROLE_IDS } },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { card: { name: "asc" } },
  });

  const commander = deck.cards.find((dc) => dc.isCommander);

  const legalLibraryRows = libraryRows.filter((lc) => {
    if (!lc.card.isCommanderLegal) return false;
    if (commander) return isColorSubset(lc.card.colorIdentity, commander.card.colorIdentity);
    return true;
  });

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

  const libraryCards: LibraryCard[] = legalLibraryRows.map((lc) => ({
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

  // Build cardDetails — deck cards overwrite library cards on collision (same card)
  const cardDetails: Record<string, CardDetail> = {};
  for (const lc of legalLibraryRows) cardDetails[lc.card.id] = toCardDetail(lc.card);
  for (const dc of deck.cards) cardDetails[dc.card.id] = toCardDetail(dc.card);

  // Merge sacrifice roles — deck cards overwrite library cards on collision
  const initialRoles: Record<string, SacrificeRole[]> = {};
  for (const lc of legalLibraryRows) {
    initialRoles[lc.card.id] = lc.card.themes.map((t) => t.id as SacrificeRole);
  }
  for (const dc of deck.cards) {
    initialRoles[dc.card.id] = dc.card.themes.map((t) => t.id as SacrificeRole);
  }

  return (
    <SacrificeView
      deckId={id}
      deckName={deck.name}
      entries={entries}
      libraryCards={libraryCards}
      cardDetails={cardDetails}
      initialRoles={initialRoles}
    />
  );
}
