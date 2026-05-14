export type CardData = {
  cardId: string;
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string | null;
  colorIdentity: string[];
  keywords: string[];
  canBeCommander: boolean;
  imageUrl: string | null;
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
