import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { DeckBuilder } from "@/components/decks/deck-builder";
import { loadVersionSummaries, resolveVersionId } from "@/lib/deck-version-loader";
import { deckEntryInclude, deckEntryOrderBy, toDeckEntry } from "@/lib/deck-entry";

export default async function DeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { step: requestedStep, v } = await searchParams;

  const userId = await requireUserId();

  const [deck, allThemes] = await Promise.all([
    // findFirst, not findUnique: the deck must match the id AND the owner, so
    // another account's deck id resolves to notFound() rather than rendering.
    prisma.deck.findFirst({
      where: { id, userId },
      include: { themes: true },
    }),
    prisma.deckTheme.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!deck) notFound();

  // Only after the ownership check above: resolveVersionId trusts its deckId.
  const versionId = await resolveVersionId(id, typeof v === "string" ? v : null);
  if (!versionId) notFound();

  const [cards, versions] = await Promise.all([
    prisma.deckCard.findMany({
      where: { versionId },
      include: {
        card: {
          include: {
            ...deckEntryInclude.card.include,
            libraryEntries: { where: { userId }, take: 1 },
          },
        },
      },
      orderBy: deckEntryOrderBy,
    }),
    loadVersionSummaries(id),
  ]);

  return (
    <DeckBuilder
      // Keyed by version: the builder seeds its state from these props once, so
      // switching ?v= must remount it rather than reuse the old version's state.
      key={versionId}
      deckId={id}
      versionId={versionId}
      versions={versions}
      initialName={deck.name}
      initialEntries={cards.map(toDeckEntry)}
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
