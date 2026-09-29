import { classifierText, isBasicLand, isColorSubset, type DeckSlot } from "@/lib/commander";
import {
  matchesRole,
  overrideKey,
  type ClassifiableCard,
  type Role,
  type RoleOverrides,
} from "@/lib/deck-template";

// The pure half of the template builder: given the card pool and a deck, which
// cards could fill a template requirement, and in what order should they be
// offered? No Prisma here — the server-side cache lives in card-pool.ts.

/**
 * A role nothing can auto-match — the built-in "Identity / Plan", or any custom
 * role made only of MANUAL_ONLY matchers. Its candidates are a text search over
 * the whole in-identity pool instead.
 */
export function isManualOnly(role: Role): boolean {
  return role.matchers.every((m) => m.kind === "MANUAL_ONLY");
}

/**
 * Ids of every pool card that fills the role on its own merits. Deck overrides
 * are deliberately not applied: this set is what card-pool.ts memoises and
 * shares across every deck.
 */
export function roleMatchSet(pool: ClassifiableCard[], role: Role): Set<string> {
  const ids = new Set<string>();
  for (const card of pool) {
    if (matchesRole(card, role)) ids.add(card.cardId);
  }
  return ids;
}

/** `fillsRole`, answered from a memoised match set instead of re-running matchers. */
function fills(
  cardId: string,
  role: Role,
  matchSet: Set<string>,
  overrides: RoleOverrides
): boolean {
  const override = overrides.get(overrideKey(cardId, role.id));
  if (override) return override === "INCLUDED";
  return matchSet.has(cardId);
}

export type CandidateQuery = {
  /** The requirement being filled. */
  role: Role;
  /** Every role in the template, for the "also fills" chips and ranking. */
  templateRoles: Role[];
  /** Roles the deck is still short on — double duty toward these ranks first. */
  gapRoleIds: Set<string>;
  /** The commander's colour identity; null when the deck has no commander yet. */
  identity: string[] | null;
  /** Every card in the version, any slot, commander included. */
  deck: { cardId: string; slot: DeckSlot }[];
  overrides: RoleOverrides;
  ownedIds: Set<string>;
  /** Free-text filter over name, type line and rules text. */
  text: string;
  ownedOnly: boolean;
};

export type Candidate = {
  card: ClassifiableCard;
  /** Other template roles this card fills, in template order. */
  alsoFills: string[];
  owned: boolean;
  /** Set when the card is already in the version outside the main deck. */
  inSlot: DeckSlot | null;
};

/**
 * The cards that could fill `query.role`, best first.
 *
 * Excluded: cards off the commander's identity, and anything already in the
 * main deck unless it's a basic (adding a basic adds another copy). Cards in
 * Potential or Wishlist stay listed and are flagged, so the user sees why the
 * obvious pick isn't missing.
 *
 * Order: cards that also close another gap, then owned cards, then mana value,
 * then name. There's no popularity signal in the local data, so this favours
 * what's multi-purpose, already in the binder and cheap.
 *
 * Lands sort last unless the role is itself about lands: a land that draws
 * cards takes a land slot, not a spell slot, and at mana value 0 utility lands
 * would otherwise top every list. Conversely a land role lists real lands
 * before spell // land flip cards, which its TYPE_LINE matcher also hits.
 */
export function selectCandidates(
  pool: ClassifiableCard[],
  query: CandidateQuery,
  matchSetFor: (role: Role) => Set<string>
): Candidate[] {
  const slotByCard = new Map(query.deck.map((d) => [d.cardId, d.slot]));
  const manual = isManualOnly(query.role);
  const roleSet = manual ? null : matchSetFor(query.role);
  const others = query.templateRoles
    .filter((r) => r.id !== query.role.id && !isManualOnly(r))
    .map((role) => ({ role, set: matchSetFor(role) }));
  const text = query.text.trim().toLowerCase();

  const candidates: { candidate: Candidate; gapCount: number; landPenalty: number }[] = [];
  const landRole = isLandRole(query.role);
  // Closing the land gap is no reason to promote a card for a spell role — and
  // the land matcher also hits spell // land flip cards, which would otherwise
  // lead every list while the mana base is empty.
  const rankingGaps = landRole
    ? query.gapRoleIds
    : new Set([...query.gapRoleIds].filter((id) => !others.some((o) => o.role.id === id && isLandRole(o.role))));

  for (const card of pool) {
    const slot = slotByCard.get(card.cardId);
    if (slot === "main" && !isBasicLand(card.typeLine)) continue;
    if (query.identity && !isColorSubset(card.colorIdentity, query.identity)) continue;

    const owned = query.ownedIds.has(card.cardId);
    if (query.ownedOnly && !owned) continue;

    if (roleSet) {
      if (!fills(card.cardId, query.role, roleSet, query.overrides)) continue;
    } else if (overrideExcluded(card.cardId, query.role, query.overrides)) {
      continue;
    }

    if (text && !matchesText(card, text)) continue;

    const alsoFills = others
      .filter(({ role, set }) => fills(card.cardId, role, set, query.overrides))
      .map(({ role }) => role.id);

    candidates.push({
      candidate: { card, alsoFills, owned, inSlot: slot && slot !== "main" ? slot : null },
      gapCount: alsoFills.filter((id) => rankingGaps.has(id)).length,
      // Mismatch between "is this a land" and "is this a land role" sorts last.
      landPenalty: landRole !== isFrontFaceLand(card.typeLine) ? 1 : 0,
    });
  }

  candidates.sort(
    (a, b) =>
      a.landPenalty - b.landPenalty ||
      b.gapCount - a.gapCount ||
      Number(b.candidate.owned) - Number(a.candidate.owned) ||
      a.candidate.card.cmc - b.candidate.card.cmc ||
      a.candidate.card.name.localeCompare(b.candidate.card.name)
  );

  return candidates.map(({ candidate }) => candidate);
}

function isLandRole(role: Role): boolean {
  return role.matchers.some((m) => m.kind === "TYPE_LINE" && /\bland\b/i.test(m.value));
}

/** Growing Rites of Itlimoc is a spell until it flips, so read the front face only. */
function isFrontFaceLand(typeLine: string): boolean {
  return /\bland\b/i.test(typeLine.split(" // ")[0]);
}

function overrideExcluded(cardId: string, role: Role, overrides: RoleOverrides): boolean {
  return overrides.get(overrideKey(cardId, role.id)) === "EXCLUDED";
}

function matchesText(card: ClassifiableCard, text: string): boolean {
  return (
    card.name.toLowerCase().includes(text) ||
    card.typeLine.toLowerCase().includes(text) ||
    classifierText(card).includes(text)
  );
}

/** One candidate as the candidates route sends it: the card, image hydrated, plus its tags. */
export type CandidateCard = ClassifiableCard & Omit<Candidate, "card">;

export type CandidatesResponse = {
  /** Unpaged match count. */
  total: number;
  candidates: CandidateCard[];
};
