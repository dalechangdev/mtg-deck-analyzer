import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { BuilderView } from "@/components/decks/builder-view";
import type { LibraryCard } from "@/components/decks/builder-view";
import { toImageUrl } from "@/lib/card-detail";
import { resolveVersionId } from "@/lib/deck-version-loader";
import { deckEntryInclude, deckEntryOrderBy, toDeckEntry } from "@/lib/deck-entry";

export default async function DeckBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const userId = await requireUserId();

  const [deck, libraryCards] = await Promise.all([
    prisma.deck.findFirst({
      where: { id, userId },
      include: { themes: true },
    }),
    prisma.libraryCard.findMany({
      where: { userId },
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

  // Only after the ownership check above: resolveVersionId trusts its deckId.
  const versionId = await resolveVersionId(id, typeof v === "string" ? v : null);
  if (!versionId) notFound();

  const cards = await prisma.deckCard.findMany({
    where: { versionId },
    include: deckEntryInclude,
    orderBy: deckEntryOrderBy,
  });

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
      // Seeds state from props once — remount when the version changes.
      key={versionId}
      deckId={id}
      versionId={versionId}
      deckName={deck.name}
      themes={deck.themes}
      maybeboardName={deck.maybeboardName ?? "Maybeboard"}
      initialEntries={cards.map(toDeckEntry)}
      libraryCards={library}
    />
  );
}
