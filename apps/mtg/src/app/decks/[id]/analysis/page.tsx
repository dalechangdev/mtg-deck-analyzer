import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import {
  loadDeckCardDetails,
  loadDeckCards,
  loadRoleOverrideRows,
  loadTemplate,
  resolveTemplateId,
} from "@/lib/deck-template-loader";
import { DeckAnalysisView } from "@/components/decks/deck-analysis-view";

export default async function DeckAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const requested = (await searchParams).templateId;

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    select: { id: true, name: true },
  });
  if (!deck) notFound();

  const templateId = await resolveTemplateId(
    id,
    typeof requested === "string" ? requested : null
  );

  const [template, entries, cardDetails, overrideRows, templates] = await Promise.all([
    loadTemplate(templateId, userId),
    loadDeckCards(id),
    loadDeckCardDetails(id),
    loadRoleOverrideRows(id),
    // The template picker offers the caller's own templates plus the shared
    // reference ones — never another account's.
    prisma.analysisTemplate.findMany({
      where: { OR: [{ ownerId: userId }, { ownerId: null }] },
      orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isBuiltIn: true },
    }),
  ]);

  // The attached template could have been deleted out from under the deck.
  if (!template) notFound();

  return (
    <DeckAnalysisView
      deckId={id}
      deckName={deck.name}
      template={template}
      templates={templates}
      entries={entries}
      cardDetails={cardDetails}
      initialOverrides={overrideRows}
    />
  );
}
