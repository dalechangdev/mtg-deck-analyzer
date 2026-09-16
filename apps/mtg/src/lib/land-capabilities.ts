/**
 * What a land does, for the land base matrix (docs/plans/land-base-matrix.md).
 *
 * Pure, like the classifiers in commander.ts: the analysis page re-runs the
 * matrix in the browser every time a card moves between slots.
 */

import { classifierText, isBasicLand, type CardData } from "@/lib/commander";
import { COLOR_ORDER } from "@/lib/mtg-styles";

/**
 * A card as the land detectors read it. `producedMana` and `layout` are optional
 * on `CardData`, so a row loaded without them still classifies; a null `layout`
 * falls back to reading the faces.
 */
export type LandCard = CardData;

export type ManaColumn = "W" | "U" | "B" | "R" | "G" | "C" | "any";

/** The order the matrix renders columns in; callers filter it to the deck's identity. */
export const MANA_COLUMN_ORDER: readonly ManaColumn[] = ["W", "U", "B", "R", "G", "C", "any"];

export type CapabilityGroup = "mana" | "tempo" | "utility" | "other";

export type LandCapability = {
  id: string;
  group: CapabilityGroup;
  label: string;
  /** Shown as the row's tooltip. */
  description: string;
  /** `colours` is `landColours(land, identity)` — the mana rows depend on the deck. */
  test: (land: LandCard, colours: ReadonlySet<ManaColumn>) => boolean;
};

// "Island" contains "land" but not as a word, so this can't mistake a type for the supertype.
const LAND_WORD = /\bland\b/i;

// Layouts whose back face only exists once the front has flipped or transformed —
// you can't play the back as a land drop.
const FRONT_FACE_LAYOUTS = new Set(["transform", "flip", "meld"]);

/**
 * Whether the card can be played as a land. A modal DFC counts if either face
 * is a land (Emeria's Call); a transform card only if its front is (Westvale
 * Abbey yes, Growing Rites of Itlimoc no). With no layout synced yet, any land
 * face counts.
 */
export function isLand(card: LandCard): boolean {
  if (card.layout && FRONT_FACE_LAYOUTS.has(card.layout)) {
    return LAND_WORD.test(card.typeLine.split(" // ")[0]);
  }
  return LAND_WORD.test(card.typeLine) || (card.faces?.some((f) => LAND_WORD.test(f.typeLine)) ?? false);
}

/**
 * `classifierText` with the card's own name read as "this land". Most oracle
 * text already says "this land", but some still names the card — "Sacrifice
 * Mount Doom and a legendary artifact" — and the self-sacrifice rules need to
 * see the difference.
 */
function landText(land: LandCard): string {
  return classifierText(land).split(land.name.toLowerCase()).join("this land");
}

/**
 * Lower-cased oracle text with reminder text kept. `classifierText` strips it,
 * but for a typed dual or a basic the reminder is the only place the mana
 * ability is written: Volatile Fjord's oracle text is "({T}: Add {U} or {R}.)".
 */
function manaText(card: CardData): string {
  const faces = card.faces?.map((f) => f.oracleText ?? "").join("\n") ?? "";
  return `${card.oracleText ?? ""}\n${faces}`.toLowerCase();
}

// Castle Doom: "{T}: Add one mana of any color. Spend this mana only to cast an artifact spell."
const RESTRICTED_MANA = /\bspend this mana only\b/;

const SYMBOL_COLUMN: Record<string, ManaColumn> = { w: "W", u: "U", b: "B", r: "R", g: "G", c: "C" };

const BASIC_TYPE_COLUMN: Record<string, ManaColumn> = {
  plains: "W",
  island: "U",
  swamp: "B",
  mountain: "R",
  forest: "G",
  wastes: "C",
};

/** The symbols in every "Add …" clause, skipping abilities whose mana is restricted. */
function parseProducedMana(text: string): Set<string> {
  const found = new Set<string>();
  const unrestricted = text
    .split("\n")
    .filter((line) => !RESTRICTED_MANA.test(line))
    .join("\n");
  for (const [, clause] of unrestricted.matchAll(/\badds?\b([^.]*)/g)) {
    if (/\bany colou?r\b/.test(clause)) COLOR_ORDER.forEach((c) => found.add(c));
    for (const [, symbol] of clause.matchAll(/\{([wubrgc])\}/g)) found.add(SYMBOL_COLUMN[symbol]);
  }
  return found;
}

type FetchTarget = { types: Set<ManaColumn>; untyped: boolean };

/**
 * What a land searches its owner's library for. Fetches produce no mana, so
 * they count for the basic types they can find; "a basic land card" finds any.
 * "Your library" matters: Boseiju's channel lets the *opponent* search.
 */
function fetchTarget(text: string): FetchTarget | null {
  const types = new Set<ManaColumn>();
  let untyped = false;
  let matched = false;

  for (const [, object] of text.matchAll(/search your library for ([^.]*?)\bcards?\b/g)) {
    const named = [...object.matchAll(/\b(plains|island|swamp|mountain|forest|wastes)s?\b/g)].map(
      ([, type]) => BASIC_TYPE_COLUMN[type]
    );
    if (named.length === 0 && !LAND_WORD.test(object)) continue; // searches for a non-land
    matched = true;
    if (named.length === 0) untyped = true;
    named.forEach((column) => types.add(column));
  }

  return matched ? { types, untyped } : null;
}

/**
 * The columns a land counts in for a deck with this colour identity.
 *
 * `producedMana` is Scryfall's list; oracle text stands in when it is empty
 * (rows synced before the column existed) or when some of the land's mana is
 * restricted — Scryfall lists Castle Doom as all five colours, but mana that
 * only casts artifacts isn't a source for the deck's spells.
 *
 * Colours outside the identity are dropped; `C` is kept. `any` marks a land
 * that covers whatever the deck needs: it makes all five colours, lets you
 * choose a basic land type, fetches an untyped basic, or — in a deck of two or
 * more colours — produces every one of them. Such a land still counts in each
 * colour column too.
 */
export function landColours(land: LandCard, identity: readonly string[]): Set<ManaColumn> {
  const text = manaText(land);
  const found = new Set<string>(
    land.producedMana?.length && !RESTRICTED_MANA.test(text) ? land.producedMana : parseProducedMana(text)
  );

  let flexible = COLOR_ORDER.every((c) => found.has(c)) || /\bchoose a basic land type\b/.test(text);

  const fetch = fetchTarget(landText(land));
  if (fetch) {
    fetch.types.forEach((column) => found.add(column));
    if (fetch.untyped) flexible = true;
  }
  if (flexible) COLOR_ORDER.forEach((c) => found.add(c));

  const columns = new Set<ManaColumn>();
  for (const c of COLOR_ORDER) if (found.has(c) && identity.includes(c)) columns.add(c);
  if (found.has("C")) columns.add("C");
  if (flexible || (identity.length >= 2 && identity.every((c) => found.has(c)))) columns.add("any");
  return columns;
}

/** Searches your library for a land — the `fetch` row. */
export function isFetch(land: LandCard): boolean {
  return fetchTarget(landText(land)) !== null;
}

type Ability = { cost: string; effect: string };

/** Every "cost: effect" line — mana abilities and channel costs included. */
function activatedAbilities(text: string): Ability[] {
  const abilities: Ability[] = [];
  for (const line of text.split("\n")) {
    // Ability words ("channel — ") are flavour; the cost starts after them.
    const body = line.replace(/^[a-z' ]+ — /, "").trim();
    const colon = body.indexOf(":");
    if (colon < 0) continue;
    const cost = body.slice(0, colon);
    // A period or quote before the colon is a sentence or a granted ability, not a cost.
    if (/[."]/.test(cost)) continue;
    if (!/\{|\b(?:sacrifice|discard|pay|exile|remove|tap)\b/.test(cost)) continue;
    abilities.push({ cost, effect: body.slice(colon + 1).trim() });
  }
  return abilities;
}

// Sacrificing anything but the land alone: "sacrifice a creature", "sacrifice
// five creatures", "sacrifice X Goats", and Mount Doom's "sacrifice this land
// and a legendary artifact". Listing count words instead missed Westvale Abbey.
// "It" is the land too: Hellion Crucible's "…from this land and sacrifice it".
const SACRIFICES_ANOTHER = /\bsacrifice (?!(?:this land|it)\b(?! and\b))/;

/** Sentences saying the land enters tapped, with or without a condition. */
function entersTappedSentences(land: LandCard): string[] {
  return landText(land)
    .split(/[.\n]/)
    .filter((sentence) => /\benters (?:the battlefield )?tapped\b/.test(sentence));
}

// "Enters tapped unless you control…" and "you may pay 2 life. If you don't, it enters tapped."
const TAPPED_CONDITION = /\bunless\b|\bif you don't\b/;

const isColour = (column: ManaColumn) => column !== "C" && column !== "any";

/** The matrix's rows, in render order. Rows overlap: one land usually fills several. */
export const LAND_CAPABILITIES: LandCapability[] = [
  {
    id: "basic",
    group: "mana",
    label: "Basic",
    description: "Basic lands, including snow basics and Wastes.",
    test: (land) => isBasicLand(land.typeLine),
  },
  {
    id: "nonbasic",
    group: "mana",
    label: "Non-basic",
    description: "Every land that isn't basic.",
    test: (land) => !isBasicLand(land.typeLine),
  },
  {
    id: "multi",
    group: "mana",
    label: "Taps 2+ colors",
    description: "Can produce at least two of the deck's colors, counting what a fetch can find.",
    test: (_, colours) => [...colours].filter(isColour).length >= 2,
  },
  {
    id: "any-colour",
    group: "mana",
    label: "Any color",
    description:
      "Covers every color the deck needs: Command Tower, untyped fetches, chosen-type lands, or a land producing all of a multicolor identity.",
    test: (_, colours) => colours.has("any"),
  },
  {
    id: "etb-tapped",
    group: "tempo",
    label: "Enters tapped",
    description: "Always enters tapped.",
    test: (land) => entersTappedSentences(land).some((s) => !TAPPED_CONDITION.test(s)),
  },
  {
    id: "conditional",
    group: "tempo",
    label: "Conditionally tapped",
    description: "Enters tapped unless a condition holds or you pay life: check, fast, slow, shock and reveal lands.",
    test: (land) => entersTappedSentences(land).some((s) => TAPPED_CONDITION.test(s)),
  },
  {
    id: "fetch",
    group: "utility",
    label: "Fetch",
    description: "Searches your library for a land.",
    test: isFetch,
  },
  {
    id: "sac-outlet",
    group: "utility",
    label: "Sac outlet",
    description: "Has a cost that sacrifices another permanent. Sacrificing itself doesn't count.",
    test: (land) => activatedAbilities(landText(land)).some((a) => SACRIFICES_ANOTHER.test(a.cost)),
  },
  {
    id: "activated",
    group: "utility",
    label: "Activated ability",
    description: "Has an activated ability that does more than add mana.",
    test: (land) => activatedAbilities(landText(land)).some((a) => !/^add\b/.test(a.effect)),
  },
  {
    id: "mdfc",
    group: "other",
    label: "MDFC",
    description: "Modal double-faced, with a land on one side and a spell on the other.",
    test: (land) => {
      // Transform cards have a land face too; only the layout tells them apart.
      if (land.layout && land.layout !== "modal_dfc") return false;
      const faces = land.faces ?? [];
      return (
        faces.length >= 2 &&
        faces.some((f) => LAND_WORD.test(f.typeLine)) &&
        faces.some((f) => !LAND_WORD.test(f.typeLine))
      );
    },
  },
  {
    id: "creature-land",
    group: "other",
    label: "Creature land",
    description: "Can become a creature.",
    test: (land) => /\bbecomes? an? [^.]*\bcreature\b/.test(landText(land)),
  },
  {
    id: "draw",
    group: "other",
    label: "Draws cards",
    description: "Draws cards, for you or for every player. Cycling has its own row.",
    test: (land) => /\bdraws? (?:a|one|two|three|x) cards?\b/.test(landText(land)),
  },
  {
    id: "cycling",
    group: "other",
    label: "Cycling",
    description: "Has cycling or a landcycling variant.",
    test: (land) => land.keywords.some((k) => /cycling$/i.test(k)),
  },
];
