export type CardData = {
  cardId: string;
  name: string;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  oracleText: string | null;
  colorIdentity: string[];
  keywords: string[];
  canBeCommander: boolean;
  imageUrl: string | null;
  ownedQuantity?: number; // copies in the Library; undefined/0 = not owned
  // Split/adventure/MDFC text, which the card-level oracleText leaves empty.
  // Classifiers read it; omit it and those cards classify as blank.
  faces?: { typeLine: string; oracleText: string | null }[];
  // Scryfall produced_mana and layout, for the land base matrix. Optional like
  // `faces`: loaders that don't read them leave them out, and the land
  // detectors fall back to oracle text / face type lines.
  producedMana?: string[];
  layout?: string | null;
};

export type DeckEntry = CardData & {
  deckCardId: string;
  isCommander: boolean;
  quantity: number;
  slot: "main" | "maybe" | "wishlist";
};

export type DeckSlot = DeckEntry["slot"];

/**
 * What each slot is called in the UI. "maybe" is the theorizing pile — the
 * stored value predates the rename to Potential, so the label lives here
 * rather than being spelled out at every call site.
 */
export const SLOT_LABEL: Record<DeckSlot, string> = {
  main: "Main deck",
  maybe: "Potential",
  wishlist: "Wishlist",
};

export type DeckValidation = {
  cardCount: number;
  commanderSet: boolean;
  colorViolations: string[]; // cardIds
  duplicates: string[];      // cardIds
};

/**
 * The Basic supertype — not a basic land *type*. Mystic Sanctuary and Dwarven
 * Mine are "Land — Island" / "Land — Mountain" and still singleton. Snow basics
 * read "Basic Snow Land — Forest", so this matches the word, not "basic land".
 */
export function isBasicLand(typeLine: string): boolean {
  const supertypes = typeLine.split(" // ")[0].split(" — ")[0];
  return /\bbasic\b/i.test(supertypes);
}

export function isColorSubset(cardIdentity: string[], commanderIdentity: string[]): boolean {
  if (cardIdentity.length === 0) return true;
  return cardIdentity.every((c) => commanderIdentity.includes(c));
}

export function validateDeck(entries: DeckEntry[]): DeckValidation {
  const commander = entries.find((e) => e.isCommander);
  const nonCommander = entries.filter((e) => !e.isCommander && e.slot === "main");

  const colorViolations: string[] = [];
  const duplicates: string[] = [];
  const seen = new Map<string, number>();

  for (const entry of nonCommander) {
    const count = (seen.get(entry.cardId) ?? 0) + 1;
    seen.set(entry.cardId, count);
    if (count > 1 && !isBasicLand(entry.typeLine)) {
      duplicates.push(entry.cardId);
    }
    if (commander && !isColorSubset(entry.colorIdentity, commander.colorIdentity)) {
      colorViolations.push(entry.cardId);
    }
  }

  return {
    cardCount: entries.reduce((sum, e) => sum + e.quantity, 0),
    commanderSet: !!commander,
    colorViolations,
    duplicates,
  };
}

const CATEGORY_ORDER = [
  "Creatures",
  "Planeswalkers",
  "Instants",
  "Sorceries",
  "Enchantments",
  "Artifacts",
  "Lands",
  "Other",
] as const;

export type CardCategory = (typeof CATEGORY_ORDER)[number];

export function getCardCategory(typeLine: string): CardCategory {
  const t = typeLine.toLowerCase();
  if (t.includes("creature")) return "Creatures";
  if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("instant")) return "Instants";
  if (t.includes("sorcery")) return "Sorceries";
  if (t.includes("enchantment")) return "Enchantments";
  if (t.includes("artifact")) return "Artifacts";
  if (t.includes("land")) return "Lands";
  return "Other";
}

export { CATEGORY_ORDER };

// ---------------------------------------------------------------------------
// Card classifiers
//
// These decide which roles a card can fill (see CLASSIFIERS in deck-template.ts).
// They run over the whole 31k-card corpus, not just cards in a deck, so they
// take `CardData` rather than `DeckEntry` and read text through the helpers
// below rather than touching `oracleText` directly.
// ---------------------------------------------------------------------------

/**
 * The text a classifier reads. Split, adventure, and modal double-faced cards
 * carry no card-level oracle text — it lives on the faces — so reading
 * `oracleText` alone silently blanks ~800 commander-legal cards, among them
 * real ramp and removal (Growing Rites of Itlimoc, Consecrate // Consume).
 */
export function classifierText(card: CardData): string {
  const faces = card.faces?.map((f) => f.oracleText ?? "").join("\n") ?? "";
  return `${card.oracleText ?? ""}\n${faces}`
    // Reminder text restates keywords and would classify by the wrong rule:
    // scry and surveil both read "look at the top card of your library", and
    // every cycling card reads "Discard this card: Draw a card". Keywords that
    // genuinely matter (investigate, overload) appear outside the parentheses.
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase();
}

/**
 * The front face's type line. A card whose *back* is a land — Growing Rites of
 * Itlimoc, any MDFC — is not a land, but its stored type line says "// Land".
 */
function frontTypeLine(card: CardData): string {
  return card.typeLine.split(" // ")[0].toLowerCase();
}

export type BoardClearScope =
  | "creatures"
  | "artifacts"
  | "enchantments"
  | "planeswalkers"
  | "lands"
  | "tokens"
  | "nonland-permanents"
  | "all-permanents"
  | "colored-permanents";

export type BoardClearMethod =
  | "destroy"
  | "exile"
  | "bounce"
  | "damage"
  | "minus-counters"
  | "sacrifice";

export type BoardClearReach = "all" | "opponents" | "selective";

export type BoardClearConditionality = "unconditional" | "x-cost" | "triggered";

export type BoardClearProfile = {
  scope: BoardClearScope[];
  method: BoardClearMethod;
  reach: BoardClearReach;
  conditionality: BoardClearConditionality;
  bypassesIndestructible: boolean;
};

function detectBoardClearScope(text: string): BoardClearScope[] {
  // Broad/composite scopes take precedence
  if (/\ball permanents?\b/.test(text) && !/nonland permanent/.test(text)) return ["all-permanents"];
  if (/nonland permanents?/.test(text)) return ["nonland-permanents"];
  if (/colored permanents?/.test(text)) return ["colored-permanents"];

  const scopes: BoardClearScope[] = [];
  if (/(?:all|each) (?:other |nontoken |attacking |blocking )?creatures?/.test(text) ||
      /creatures? (?:your opponents control|you don't control|target player controls) gets? -/.test(text) ||
      /creatures? gets? -/.test(text) ||
      /-1\/-1 counters? on each creature/.test(text) ||
      /damage to each (?:other )?creature/.test(text)) {
    scopes.push("creatures");
  }
  if (/(?:all|each) (?:other |nontoken )?artifacts?/.test(text)) scopes.push("artifacts");
  if (/(?:all|each) (?:other |nontoken )?enchantments?/.test(text)) scopes.push("enchantments");
  if (/(?:all|each) (?:other |nontoken )?planeswalkers?/.test(text)) scopes.push("planeswalkers");
  if (/(?:destroy|exile) all lands?/.test(text)) scopes.push("lands");
  if (/(?:all|each) (?:creature )?tokens?/.test(text)) scopes.push("tokens");

  return scopes.length > 0 ? scopes : ["creatures"];
}

/** Mass -X/-X, including the {X} spells whose toughness reduction isn't a literal digit. */
const MASS_SHRINK = [
  /(?:all|each) (?:other |attacking |blocking |nontoken )?creatures? gets? [-−]/,
  /creatures? (?:your opponents control|you don't control|target player controls) gets? [-−]/,
  /put (?:x|\d+|a) -1\/-1 counters? on each creature/,
];

/** Mass sacrifice. Restricted to "each" — "target player sacrifices" is a single edict. */
const MASS_SACRIFICE = [
  /(?:each|every) (?:other )?(?:player|opponent)[^.]{0,90}sacrifices?\b/,
  /sacrifices? all (?:other )?(?:creatures?|permanents?|nonland permanents?|colored permanents?)/,
];

function detectBoardClearMethod(text: string): BoardClearMethod | null {
  const clauses = text.split(/\.\s*/);

  // Order matters: most specific patterns first
  if (
    // To *hand* — "return all creature cards to the battlefield" is mass
    // reanimation, which fills the board rather than clearing it.
    /return all (?:nonland |non)?(?:creatures?|permanents?)[^.]{0,60}owners?'? hands?/.test(text) ||
    // Cyclonic Rift: overload + "return target nonland permanent"
    (text.includes("overload") && /return (?:target )?nonland permanent/.test(text))
  ) {
    return "bounce";
  }
  if (/deals? [^.]{0,60}damage[^.]{0,40}to each (?:other )?creature/.test(text)) return "damage";
  if (MASS_SHRINK.some((re) => re.test(text))) return "minus-counters";

  const exiles = clauses.some(
    (c) =>
      (/exile all (?!cards)/.test(c) || /exile each (?!player|opponent)/.test(c)) &&
      // Graveyard hate answers cards, not the board.
      !/graveyard/.test(c)
  );
  // Exiling and handing it straight back is a blink (Golden Argosy), not removal.
  if (exiles && !/return (?:them|those cards|it) to the battlefield/.test(text)) return "exile";

  if (/destroy all (?!copies)/.test(text) || /destroy each (?!player|opponent)/.test(text)) return "destroy";
  if (MASS_SACRIFICE.some((re) => re.test(text))) return "sacrifice";

  // Overload rewrites every "target" into "each", so an overloaded removal spell
  // hits the whole board (Vandalblast, Winds of Abandon). Overload on a pump or
  // animate spell (Dragonshift) disrupts nothing, hence the verb check.
  if (/\boverload\b/.test(text)) {
    if (/exile target/.test(text)) return "exile";
    if (/return target/.test(text)) return "bounce";
    if (/destroy target/.test(text)) return "destroy";
    if (/deals? (?:\d+|x) damage to target/.test(text)) return "damage";
  }

  return null;
}

export function getBoardClearProfile(card: CardData): BoardClearProfile | null {
  const text = classifierText(card);
  const manaCost = (card.manaCost ?? "").toLowerCase();
  const typeLine = frontTypeLine(card);

  const method = detectBoardClearMethod(text);
  if (!method) return null;

  const scope = detectBoardClearScope(text);

  let reach: BoardClearReach = "all";
  if (text.includes("you don't control") || text.includes("your opponents control")) {
    reach = "opponents";
  } else if (/choose (?:one or more|two or more|one, two)/.test(text)) {
    reach = "selective";
  }

  let conditionality: BoardClearConditionality = "unconditional";
  if (manaCost.includes("{x}") || (text.includes("pay x life") && text.includes("-x/-x"))) {
    conditionality = "x-cost";
  } else if (
    !typeLine.includes("instant") &&
    !typeLine.includes("sorcery") &&
    /when(?:ever)?\b/.test(text)
  ) {
    // Board wipe as a triggered ability (e.g. Sunblast Angel ETB)
    conditionality = "triggered";
  }

  const bypassesIndestructible =
    method === "exile" ||
    method === "bounce" ||
    method === "minus-counters" ||
    method === "sacrifice";

  return { scope, method, reach, conditionality, bypassesIndestructible };
}

export function isBoardClear(card: CardData): boolean {
  return getBoardClearProfile(card) !== null;
}

/**
 * Mana acceleration. Lands are deliberately excluded — they fill the `land`
 * role, and counting the mana base here would swamp every ramp count.
 * Cost reduction (Improvise, "spells cost {1} less") is a different axis and
 * doesn't count: it lowers what you spend, not what you can produce.
 */
export function isManaRamp(card: CardData): boolean {
  if (frontTypeLine(card).includes("land")) return false;

  const text = classifierText(card);

  // Produces mana: rocks, dorks, rituals ("Add {B}{B}{B}"), and tap-payoff
  // triggers ("Whenever you tap a land for mana, add one mana of any type...").
  if (/\badds?\s*\{/.test(text)) return true;
  if (/\badds?\b[^.]{0,60}\bmana\b/.test(text)) return true;

  // Mana doublers — Mana Reflection, Nyxbloom Ancient.
  if (/produces?[^.]{0,40}(?:twice|three times) as much/.test(text)) return true;

  // Land search. "your library" matters: Path to Exile and Assassin's Trophy
  // fetch a basic for the card's *victim*, which is removal, not ramp.
  if (/search(?:es)? your library for [^.]{0,80}\b(?:lands?|forests?|islands?|swamps?|mountains?|plains)\b/.test(text)) {
    return true;
  }

  // Extra land drops from hand — Exploration, Azusa, Burgeoning.
  if (/play (?:an?|two|three|any number of|up to \w+) additional lands?/.test(text)) return true;
  if (/put (?:a|an|up to \w+|that|those|the) [^.]{0,30}?lands? cards? from your hand onto the battlefield/.test(text)) {
    return true;
  }

  // Tokens that tap for mana — Treasure, Gold, Powerstone.
  if (/creates?[^.]{0,60}\b(?:treasure|gold|powerstone)\b[^.]{0,20}token/.test(text)) return true;

  return false;
}

const COUNT_WORDS: Record<string, string> = {
  a: "1", one: "1", two: "2", three: "3", four: "4",
};

function normalizeCount(word: string): string {
  return COUNT_WORDS[word] ?? word;
}

/**
 * Nets extra cards or gives repeatable selection.
 *
 * Leans on English conjugation: "draw a card" (imperative) is addressed to you,
 * while "draws a card" belongs to someone else — that one letter separates
 * Rhystic Study from Howling Mine. "Target player draws" is the exception, since
 * you can always target yourself (Blue Sun's Zenith).
 */
export function isCardAdvantage(card: CardData): boolean {
  const text = classifierText(card);

  // Looting and rummaging draw and discard the *same* number — that's filtering,
  // not advantage. An uneven trade (Pull from Tomorrow: draw X, discard one)
  // still nets cards, so only an equal swap disqualifies.
  const loot =
    text.match(
      /draws? (a|one|two|three|four|\d+|x) cards?,? (?:then|and) discards? (a|one|two|three|four|\d+|x|that many) cards?/
    ) ??
    // Same trade, stated the other way round: "discard a card. If you do, draw a card."
    text
      .match(
        /discards? (a|one|two|three|four|\d+|x) cards?[\s\S]{0,40}?(?:if you do|then),? draws? (a|one|two|three|four|\d+|x) cards?/
      );
  const isFilter = loot !== null && normalizeCount(loot[1]) === normalizeCount(loot[2]);

  const drawsYou =
    /\bdraw (?:a|an|one|two|three|four|five|six|seven|x|\d+|that many|up to \w+|another|cards)\b/.test(text) ||
    /target player draws/.test(text);
  if (drawsYou && !isFilter) return true;

  // Wheels — everyone dumps their hand and refills, which nets you cards.
  if (/discards? their hand[^.]{0,60}draws?/.test(text)) return true;

  // Impulse draw and top-of-library access.
  // [\s\S] rather than [^.]: the permission is a separate sentence from the exile.
  if (/exile the top [^.]{0,40}of your library[\s\S]{0,90}you may (?:play|cast)/.test(text)) {
    return true;
  }
  if (/look at the top (?:card|\w+ cards) of your library/.test(text)) return true;
  if (/\binvestigate\b/.test(text)) return true;

  // Cards that end up in hand by another route — Fact or Fiction, recursion,
  // Necropotence. Checked per sentence so land fetch that happens to put a land
  // in hand (Cultivate, Sylvan Scrying) stays ramp rather than becoming draw.
  return text
    .split(/\.\s*/)
    .some((s) => /(?:into|to) your hand/.test(s) && !/search(?:es)? your library/.test(s));
}

/**
 * Answers a single permanent, spell, or player.
 *
 * Overlap with mass disruption is intended — Cyclonic Rift and Damn genuinely
 * do both, and the template evaluator counts a card toward every role it fills.
 * Graveyard hate ("exile target card from a graveyard") is deliberately out:
 * it answers a card, not a permanent, spell, or player.
 */
export function isTargetedDisruption(card: CardData): boolean {
  const text = classifierText(card);

  // Up to two adjectives so "nonartifact creature" and "attacking creature" hit.
  // The lookahead drops "target creature card from a graveyard" — graveyard hate
  // answers a card, not a permanent.
  const TARGET = "(?:[a-z][a-z-]* ){0,2}(?:creature|permanent|artifact|enchantment|planeswalker|land|battle|token|spell|player|opponent)s?(?! cards?\\b)";

  if (new RegExp(`(?:destroy|exile) (?:target|up to (?:one|two|three) targets?|another target) ${TARGET}`).test(text)) {
    return true;
  }
  if (/counter target [^.]{0,60}\bspell\b/.test(text)) return true;
  if (/counter target (?:activated|triggered) ability/.test(text)) return true;
  if (
    text
      .split(/\.\s*/)
      .some(
        (clause) =>
          /return target [^.]{0,80}(?:owner'?s? hand|owner'?s? library|top of (?:its|their) owner)/.test(clause) &&
          // "you control" bounces your own permanent to save or re-trigger it;
          // "you don't control" is untouched by this check.
          !/target [^.]{0,40}you control/.test(clause)
      )
  ) {
    return true;
  }
  // Chaos Warp — tucks a target without destroying or exiling it.
  if (/the owner of target (?:permanent|creature)/.test(text)) return true;
  if (/deals? (?:\d+|x) damage to (?:target|any target)/.test(text)) return true;
  if (/target creature[^.]{0,60}gets? [-−]/.test(text)) return true;
  // Fight and bite removal — Prey Upon, Bite Down.
  if (/fights? target creature/.test(text)) return true;
  if (/deals damage equal to its power to target creature/.test(text)) return true;
  if (/target (?:player|opponent) (?:discards|reveals their hand|sacrifices)/.test(text)) return true;

  // Auras that neutralize or steal rather than kill — Song of the Dryads,
  // Darksteel Mutation, Control Magic. Pump auras don't qualify: they answer
  // nothing.
  if (/enchant (?:creature|permanent|artifact|land|planeswalker)/.test(text)) {
    // Anchored to a sentence start: "Enchanted permanent is a Forest" neutralizes,
    // while "as long as enchanted permanent is a creature, it has flying" buffs.
    const neutralizes = text
      .split(/(?:^|\.\s*|\n)/)
      .some((clause) =>
        /^enchanted \w+ (?:is a|are|can't|doesn't|loses all|has base|gets? [-−])/.test(clause.trim())
      );
    if (neutralizes || /you control enchanted (?:creature|permanent|artifact|land)/.test(text)) {
      return true;
    }
  }

  return false;
}
