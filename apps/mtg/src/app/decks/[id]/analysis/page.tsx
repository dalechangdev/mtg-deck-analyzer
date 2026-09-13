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
import { resolveVersionId } from "@/lib/deck-version-loader";
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
  const { templateId: requested, v } = await searchParams;

  const deck = await prisma.deck.findFirst({
    where: { id, userId },
    select: { id: true, name: true },
  });
  if (!deck) notFound();

  const [templateId, versionId] = await Promise.all([
    resolveTemplateId(id, typeof requested === "string" ? requested : null),
    resolveVersionId(id, typeof v === "string" ? v : null),
  ]);
  if (!versionId) notFound();

  const [template, entries, cardDetails, overrideRows, templates] = await Promise.all([
    loadTemplate(templateId, userId),
    loadDeckCards(versionId),
    loadDeckCardDetails(versionId),
    // Role overrides are deck-level: a card plays the same role in every version.
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
      versionId={versionId}
      deckName={deck.name}
      template={template}
      templates={templates}
      entries={entries}
      cardDetails={cardDetails}
      initialOverrides={overrideRows}
    />
  );
}
