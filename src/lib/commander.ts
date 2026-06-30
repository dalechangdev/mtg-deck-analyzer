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
};

export type DeckEntry = CardData & {
  deckCardId: string;
  isCommander: boolean;
  quantity: number;
  slot: "main" | "maybe" | "wishlist";
};

export type DeckValidation = {
  cardCount: number;
  commanderSet: boolean;
  colorViolations: string[]; // cardIds
  duplicates: string[];      // cardIds
};

const BASIC_LAND_TYPES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);

export function isBasicLand(typeLine: string): boolean {
  return typeLine.toLowerCase().includes("basic land") ||
    BASIC_LAND_TYPES.has(typeLine.split(" — ")[1]?.trim() ?? "");
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
      /creatures? gets? -/.test(text) ||
      /\d+ damage to each creature/.test(text)) {
    scopes.push("creatures");
  }
  if (/(?:all|each) (?:other |nontoken )?artifacts?/.test(text)) scopes.push("artifacts");
  if (/(?:all|each) (?:other |nontoken )?enchantments?/.test(text)) scopes.push("enchantments");
  if (/(?:all|each) (?:other |nontoken )?planeswalkers?/.test(text)) scopes.push("planeswalkers");
  if (/(?:destroy|exile) all lands?/.test(text)) scopes.push("lands");
  if (/(?:all|each) (?:creature )?tokens?/.test(text)) scopes.push("tokens");

  return scopes.length > 0 ? scopes : ["creatures"];
}

export function getBoardClearProfile(entry: DeckEntry): BoardClearProfile | null {
  const text = (entry.oracleText ?? "").toLowerCase();
  const manaCost = (entry.manaCost ?? "").toLowerCase();
  const typeLine = entry.typeLine.toLowerCase();

  let method: BoardClearMethod | null = null;

  // Order matters: most specific patterns first
  if (
    /return all (?:nonland |non)?(?:creatures?|permanents?)/.test(text) ||
    // Cyclonic Rift: overload + "return target nonland permanent"
    (text.includes("overload") && /return (?:target )?nonland permanent/.test(text))
  ) {
    method = "bounce";
  } else if (/deals? \d+ damage to each creature/.test(text)) {
    method = "damage";
  } else if (/(?:all|each) creatures? gets? -\d/.test(text)) {
    method = "minus-counters";
  } else if (/exile all (?!cards)/.test(text) || /exile each (?!player|opponent)/.test(text)) {
    method = "exile";
  } else if (/destroy all (?!copies)/.test(text) || /destroy each (?!player|opponent)/.test(text)) {
    method = "destroy";
  } else if (/each player sacrifices all/.test(text)) {
    method = "sacrifice";
  }

  if (!method) return null;

  const scope = detectBoardClearScope(text);

  let reach: BoardClearReach = "all";
  if (text.includes("you don't control")) {
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

export function isBoardClear(entry: DeckEntry): boolean {
  return getBoardClearProfile(entry) !== null;
}

export function isManaRamp(entry: DeckEntry): boolean {
  const text = (entry.oracleText ?? "").toLowerCase();
  const type = entry.typeLine.toLowerCase();

  if (type.includes("land")) return false;

  // Tap-to-add mana (mana rocks, mana dorks)
  if (text.includes("{t}: add")) return true;

  // Land search spells (Rampant Growth, Cultivate, etc.)
  if (text.includes("search your library for") && text.includes("land card")) return true;

  // Put land onto battlefield directly (Harrow, Crop Rotation, etc.)
  if (text.includes("land") && text.includes("onto the battlefield") && !text.includes("opponent")) return true;

  // Extra land drops (Exploration, Azusa, etc.)
  if (text.includes("you may play an additional land")) return true;

  return false;
}
