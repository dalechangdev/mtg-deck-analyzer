import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
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
  const requested = (await searchParams).templateId;

  const deck = await prisma.deck.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!deck) notFound();

  const templateId = await resolveTemplateId(
    id,
    typeof requested === "string" ? requested : null
  );

  const [template, entries, overrideRows, templates] = await Promise.all([
    loadTemplate(templateId),
    loadDeckCards(id),
    loadRoleOverrideRows(id),
    prisma.analysisTemplate.findMany({
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
      initialOverrides={overrideRows}
    />
  );
}
