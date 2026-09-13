import { prisma } from "@/lib/prisma";
import type { CardDetail } from "@/components/cards/card-detail-modal";
import { cardDetailInclude, toCardDetail } from "@/lib/card-detail";
import { deckEntryOrderBy, toDeckEntry } from "@/lib/deck-entry";
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
 * PRECONDITION FOR EVERY FUNCTION IN THIS FILE: the caller has already
 * established that the signed-in user owns `deckId` — via requireDeckAccess()
 * in a Route Handler, or a `findFirst({ where: { id, userId } })` in a page —
 * and, for loaders that take a `versionId`, that the version belongs to that
 * deck (resolveVersionId or requireVersionAccess).
 *
 * Cards are per version; role overrides and templates are per deck.
 *
 * These loaders take ids and do not re-check ownership, so calling one
 * with an unvalidated id from a URL reads another account's deck. The checks
 * are not repeated here because every current caller gates first and the extra
 * round trip on each of five loaders is not free; if that ever stops being
 * true, move the gate in here rather than hoping.
 */

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

/**
 * `viewerId` is required, not optional, because templateId reaches this
 * function straight from a `?templateId=` query parameter: resolveTemplateId
 * lets an explicit request win over the deck's attachment. Without the owner
 * filter, anyone could read another account's private template by guessing its
 * id — the deck gate upstream says nothing about who owns the TEMPLATE.
 */
export async function loadTemplate(
  templateId: string,
  viewerId: string
): Promise<Template | null> {
  const template = await prisma.analysisTemplate.findFirst({
    where: {
      id: templateId,
      OR: [{ ownerId: viewerId }, { ownerId: null }],
    },
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

export async function loadDeckCards(versionId: string): Promise<AnalyzedCard[]> {
  const deckCards = await prisma.deckCard.findMany({
    where: { versionId },
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
    orderBy: deckEntryOrderBy,
  });

  return deckCards.map((dc) => ({
    ...toDeckEntry(dc),
    faces: dc.card.faces.map((f) => ({ typeLine: f.typeLine, oracleText: f.oracleText })),
    themeIds: dc.card.themes.map((t) => t.id),
  }));
}

/**
 * Full card details for a version, keyed by cardId — what the card modal needs
 * on top of the trimmed `AnalyzedCard` rows the evaluator runs on.
 */
export async function loadDeckCardDetails(
  versionId: string
): Promise<Record<string, CardDetail>> {
  const deckCards = await prisma.deckCard.findMany({
    where: { versionId },
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
  versionId: string,
  templateId: string,
  viewerId: string,
  options: EvaluateOptions = {}
): Promise<TemplateAnalysis | null> {
  const [template, entries, overrides] = await Promise.all([
    loadTemplate(templateId, viewerId),
    loadDeckCards(versionId),
    loadRoleOverrides(deckId),
  ]);
  if (!template) return null;

  return evaluateTemplate(entries, template, overrides, options);
}
