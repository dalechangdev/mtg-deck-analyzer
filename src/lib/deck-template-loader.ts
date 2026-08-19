import { prisma } from "@/lib/prisma";
import type { CardDetail } from "@/components/cards/card-detail-modal";
import { cardDetailInclude, toCardDetail, toImageUrl } from "@/lib/card-detail";
import {
  evaluateTemplate,
  toOverrides,
  type AnalyzedCard,
  type EvaluateOptions,
  type MatcherKind,
  type RoleOverrideRow,
  type RoleOverrides,
  type Template,
  type TemplateAnalysis,
} from "@/lib/deck-template";

// Server-side glue: loads a deck + template out of Postgres and hands them to
// the pure evaluator in deck-template.ts. Analyses are derived, never stored —
// a card swap can't leave a stale scorecard behind.

export const DEFAULT_TEMPLATE_ID = "commander-baseline";

/**
 * Which template should this deck be scored against? An explicit request wins,
 * then whatever the deck has attached, then the built-in baseline.
 */
export async function resolveTemplateId(
  deckId: string,
  requested?: string | null
): Promise<string> {
  if (requested) return requested;

  const attached = await prisma.deckTemplate.findFirst({
    where: { deckId },
    orderBy: { attachedAt: "asc" },
    select: { templateId: true },
  });

  return attached?.templateId ?? DEFAULT_TEMPLATE_ID;
}

export async function loadTemplate(templateId: string): Promise<Template | null> {
  const template = await prisma.analysisTemplate.findUnique({
    where: { id: templateId },
    include: {
      requirements: {
        orderBy: { sortOrder: "asc" },
        include: { role: { include: { matchers: true } } },
      },
    },
  });
  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    deckSize: template.deckSize,
    requirements: template.requirements.map((req) => ({
      targetCount: req.targetCount,
      minCount: req.minCount,
      maxCount: req.maxCount,
      note: req.note,
      role: {
        id: req.role.id,
        name: req.role.name,
        matchers: req.role.matchers.map((m) => ({
          kind: m.kind as MatcherKind,
          value: m.value,
        })),
      },
    })),
  };
}

export async function loadDeckCards(deckId: string): Promise<AnalyzedCard[]> {
  const deckCards = await prisma.deckCard.findMany({
    where: { deckId },
    include: {
      card: {
        include: {
          themes: { select: { id: true } },
          printings: { take: 1, orderBy: { setCode: "desc" } },
          // All faces, not just the first: the classifiers read face text for
          // split, adventure, and modal double-faced cards.
          faces: { orderBy: { faceIndex: "asc" } },
        },
      },
    },
    orderBy: [{ isCommander: "desc" }, { card: { name: "asc" } }],
  });

  return deckCards.map((dc) => ({
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
    faces: dc.card.faces.map((f) => ({ typeLine: f.typeLine, oracleText: f.oracleText })),
    themeIds: dc.card.themes.map((t) => t.id),
  }));
}

/**
 * Full card details for the deck, keyed by cardId — what the card modal needs
 * on top of the trimmed `AnalyzedCard` rows the evaluator runs on.
 */
export async function loadDeckCardDetails(
  deckId: string
): Promise<Record<string, CardDetail>> {
  const deckCards = await prisma.deckCard.findMany({
    where: { deckId },
    include: { card: { include: cardDetailInclude } },
  });

  return Object.fromEntries(
    deckCards.map((dc) => [dc.card.id, toCardDetail(dc.card)])
  );
}

export async function loadRoleOverrideRows(deckId: string): Promise<RoleOverrideRow[]> {
  return prisma.deckCardRole.findMany({
    where: { deckId },
    select: { cardId: true, roleId: true, assignment: true },
  });
}

export async function loadRoleOverrides(deckId: string): Promise<RoleOverrides> {
  return toOverrides(await loadRoleOverrideRows(deckId));
}

export async function analyzeDeck(
  deckId: string,
  templateId: string,
  options: EvaluateOptions = {}
): Promise<TemplateAnalysis | null> {
  const [template, entries, overrides] = await Promise.all([
    loadTemplate(templateId),
    loadDeckCards(deckId),
    loadRoleOverrides(deckId),
  ]);
  if (!template) return null;

  return evaluateTemplate(entries, template, overrides, options);
}
