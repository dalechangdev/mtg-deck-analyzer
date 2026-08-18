import type { DeckEntry } from "@/lib/commander";
import { isBoardClear, isManaRamp } from "@/lib/commander";

// A deck card plus the global CardTheme tags it carries — THEME matchers need them.
export type AnalyzedCard = DeckEntry & { themeIds: string[] };

export type MatcherKind =
  | "CLASSIFIER"
  | "THEME"
  | "TYPE_LINE"
  | "ORACLE_REGEX"
  | "MANUAL_ONLY";

export type RoleMatcher = { kind: MatcherKind; value: string };

export type Role = {
  id: string;
  name: string;
  matchers: RoleMatcher[];
};

export type Requirement = {
  role: Role;
  targetCount: number;
  minCount: number | null;
  maxCount: number | null;
  note: string | null;
};

export type Template = {
  id: string;
  name: string;
  deckSize: number;
  requirements: Requirement[]; // caller supplies these in sortOrder
};

// Per-deck human overrides, keyed by `${cardId}:${roleId}`
export type RoleOverrides = Map<string, "INCLUDED" | "EXCLUDED">;

export type RoleOverrideRow = {
  cardId: string;
  roleId: string;
  assignment: "INCLUDED" | "EXCLUDED";
};

export function overrideKey(cardId: string, roleId: string): string {
  return `${cardId}:${roleId}`;
}

export function toOverrides(rows: RoleOverrideRow[]): RoleOverrides {
  return new Map(rows.map((r) => [overrideKey(r.cardId, r.roleId), r.assignment]));
}

// CLASSIFIER matchers resolve against this registry. A matcher naming a
// predicate that isn't here never matches — roles stay usable when a
// classifier is renamed, they just fall back to their other matchers.
const CLASSIFIERS: Record<string, (card: AnalyzedCard) => boolean> = {
  isManaRamp,
  isBoardClear,
};

const regexCache = new Map<string, RegExp | null>();

function compile(source: string): RegExp | null {
  if (!regexCache.has(source)) {
    try {
      regexCache.set(source, new RegExp(source, "i"));
    } catch {
      regexCache.set(source, null); // bad user-authored regex — never matches
    }
  }
  return regexCache.get(source) ?? null;
}

function matchesMatcher(card: AnalyzedCard, matcher: RoleMatcher): boolean {
  switch (matcher.kind) {
    case "MANUAL_ONLY":
      return false;
    case "CLASSIFIER":
      return CLASSIFIERS[matcher.value]?.(card) ?? false;
    case "THEME":
      return card.themeIds.includes(matcher.value);
    case "TYPE_LINE":
      return card.typeLine.toLowerCase().includes(matcher.value.toLowerCase());
    case "ORACLE_REGEX":
      return compile(matcher.value)?.test(card.oracleText ?? "") ?? false;
  }
}

/**
 * Does this card fill this role in this deck?
 * A manual assignment always wins — in both directions. Otherwise the role's
 * matchers are OR'd together.
 */
export function fillsRole(
  card: AnalyzedCard,
  role: Role,
  overrides: RoleOverrides
): boolean {
  const override = overrides.get(overrideKey(card.cardId, role.id));
  if (override) return override === "INCLUDED";

  return role.matchers.some((m) => matchesMatcher(card, m));
}

export type RequirementResult = {
  roleId: string;
  roleName: string;
  targetCount: number;
  minCount: number;
  maxCount: number | null;
  actual: number; // sum of quantity, so basics count once per copy
  delta: number; // actual - targetCount
  status: "under" | "met" | "over";
  cardIds: string[];
  note: string | null;
};

export type TemplateAnalysis = {
  templateId: string;
  templateName: string;
  deckSize: number;
  deckCardCount: number; // main-slot cards counted, commander excluded
  requirements: RequirementResult[];
  /** Targets summed. Exceeding deckSize is normal — roles overlap. */
  targetSum: number;
  /** Distinct cards filling at least one role. */
  coveredCards: number;
  /** Main-slot cards filling no role in this template — the review queue. */
  unassignedCardIds: string[];
};

export type EvaluateOptions = {
  /** Count the commander toward requirements. Off by default. */
  includeCommander?: boolean;
};

/**
 * Score a deck against a template.
 *
 * Requirements deliberately overlap: one card can satisfy several roles, so
 * `actual` counts across requirements can sum past the deck size. Compare
 * `targetSum` against `deckSize` to see how much double duty the template asks
 * for, and `coveredCards` against `deckCardCount` to see how much of the deck
 * the template actually accounts for.
 *
 * A requirement with no explicit `minCount` is treated as a floor at
 * `targetCount`; with no `maxCount` it has no ceiling.
 */
export function evaluateTemplate(
  entries: AnalyzedCard[],
  template: Template,
  overrides: RoleOverrides = new Map(),
  options: EvaluateOptions = {}
): TemplateAnalysis {
  const cards = entries.filter(
    (e) => e.slot === "main" && (options.includeCommander || !e.isCommander)
  );

  const covered = new Set<string>();

  const requirements = template.requirements.map<RequirementResult>((req) => {
    const matched = cards.filter((c) => fillsRole(c, req.role, overrides));
    for (const c of matched) covered.add(c.cardId);

    const actual = matched.reduce((sum, c) => sum + c.quantity, 0);
    const min = req.minCount ?? req.targetCount;
    const max = req.maxCount;

    return {
      roleId: req.role.id,
      roleName: req.role.name,
      targetCount: req.targetCount,
      minCount: min,
      maxCount: max,
      actual,
      delta: actual - req.targetCount,
      status: actual < min ? "under" : max !== null && actual > max ? "over" : "met",
      cardIds: matched.map((c) => c.cardId),
      note: req.note,
    };
  });

  return {
    templateId: template.id,
    templateName: template.name,
    deckSize: template.deckSize,
    deckCardCount: cards.reduce((sum, c) => sum + c.quantity, 0),
    requirements,
    targetSum: template.requirements.reduce((sum, r) => sum + r.targetCount, 0),
    coveredCards: covered.size,
    unassignedCardIds: cards.filter((c) => !covered.has(c.cardId)).map((c) => c.cardId),
  };
}
