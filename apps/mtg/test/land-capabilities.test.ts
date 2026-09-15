/**
 * Land detectors behind the land base matrix. No database: fixtures are real
 * card rows (test/fixtures/lands.ts). When a regex misfires on a real card,
 * add that card here before fixing it.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isBasicLand } from "@/lib/commander";
import {
  isLand,
  LAND_CAPABILITIES,
  landColours,
  MANA_COLUMN_ORDER,
  type LandCard,
  type ManaColumn,
} from "@/lib/land-capabilities";
import { LANDS } from "./fixtures/lands";

const WUBRG = ["W", "U", "B", "R", "G"];

function land(name: string): LandCard {
  const card = LANDS[name];
  assert.ok(card, `no fixture named ${name}`);
  return card;
}

function capabilityIds(card: LandCard, identity: string[] = WUBRG): string[] {
  const colours = landColours(card, identity);
  return LAND_CAPABILITIES.filter((c) => c.test(card, colours)).map((c) => c.id);
}

function columns(card: LandCard, identity: string[]): ManaColumn[] {
  const set = landColours(card, identity);
  return MANA_COLUMN_ORDER.filter((c) => set.has(c));
}

// Capability ids in LAND_CAPABILITIES order, for a five-colour deck.
const EXPECTED: Record<string, string[]> = {
  Plains: ["basic"],
  "Snow-Covered Forest": ["basic"],
  Wastes: ["basic"],
  // A basic land *type* without the Basic supertype.
  "Mystic Sanctuary": ["nonbasic", "conditional"],
  "Dwarven Mine": ["nonbasic", "conditional"],
  "Command Tower": ["nonbasic", "multi", "any-colour"],
  "City of Brass": ["nonbasic", "multi", "any-colour"],
  "Temple Garden": ["nonbasic", "multi", "conditional"],
  "Overgrown Tomb": ["nonbasic", "multi", "conditional"],
  "Glacial Fortress": ["nonbasic", "multi", "conditional"],
  "Spirebluff Canal": ["nonbasic", "multi", "conditional"],
  "Sunken Hollow": ["nonbasic", "multi", "conditional"],
  "Castle Vantress": ["nonbasic", "conditional", "activated"],
  "Temple of Malady": ["nonbasic", "multi", "etb-tapped"],
  "Volatile Fjord": ["nonbasic", "multi", "etb-tapped"],
  "Fetid Pools": ["nonbasic", "multi", "etb-tapped", "cycling"],
  "Bojuka Bog": ["nonbasic", "etb-tapped"],
  "Tranquil Thicket": ["nonbasic", "etb-tapped", "cycling"],
  "Treetop Village": ["nonbasic", "etb-tapped", "activated", "creature-land"],
  "Kyoshi Village": ["nonbasic", "multi", "etb-tapped", "activated", "draw"],
  Mutavault: ["nonbasic", "activated", "creature-land"],
  "Evolving Wilds": ["nonbasic", "multi", "any-colour", "fetch", "activated"],
  "Prismatic Vista": ["nonbasic", "multi", "any-colour", "fetch", "activated"],
  "Windswept Heath": ["nonbasic", "multi", "fetch", "activated"],
  "Cabaretti Courtyard": ["nonbasic", "multi", "fetch"],
  "High Market": ["nonbasic", "sac-outlet", "activated"],
  "Phyrexian Tower": ["nonbasic", "sac-outlet"],
  // Names itself in its own oracle text, and sacrifices an artifact alongside.
  "Mount Doom": ["nonbasic", "multi", "sac-outlet", "activated"],
  // Restricted "any color" mana isn't a colour source.
  "Castle Doom": ["nonbasic", "sac-outlet", "activated"],
  "Haven of the Spirit Dragon": ["nonbasic", "activated"],
  "Blast Zone": ["nonbasic", "activated"],
  "Deserted Temple": ["nonbasic", "activated"],
  "Maze of Ith": ["nonbasic", "activated"],
  "Boseiju, Who Endures": ["nonbasic", "activated"],
  "Mikokoro, Center of the Sea": ["nonbasic", "activated", "draw"],
  "Reliquary Tower": ["nonbasic"],
  Vesuva: ["nonbasic"],
  "Thran Portal": ["nonbasic", "multi", "any-colour", "conditional"],
  "Multiversal Passage": ["nonbasic", "multi", "any-colour", "conditional"],
  "Bridgeworks Battle // Tanglespan Bridgeworks": ["nonbasic", "conditional", "mdfc"],
  "Barkchannel Pathway // Tidechannel Pathway": ["nonbasic", "multi"],
  // Transform, not modal: a land face, but not an MDFC.
  "Westvale Abbey // Ormendahl, Profane Prince": ["nonbasic", "sac-outlet", "activated"],
};

// Fixtures that are deliberately not lands — isLand must reject them.
const NOT_LANDS = ["Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun"];

test("every fixture has an expectation", () => {
  assert.deepEqual([...Object.keys(EXPECTED), ...NOT_LANDS].sort(), Object.keys(LANDS).sort());
});

for (const [name, expected] of Object.entries(EXPECTED)) {
  test(`capabilities: ${name}`, () => {
    assert.deepEqual(capabilityIds(land(name)), expected);
  });
}

test("capability ids are unique", () => {
  const ids = LAND_CAPABILITIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("sac-outlet: any count of other permanents, never the land alone", () => {
  const withCost = (oracleText: string) => ({ ...land("Reliquary Tower"), oracleText });
  const outlet = (text: string) =>
    capabilityIds(withCost(text)).includes("sac-outlet");
  // Westvale Abbey's cost.
  assert.equal(outlet("{5}, {T}, Pay 1 life, Sacrifice five creatures: Transform this land."), true);
  assert.equal(outlet("{T}, Sacrifice X Goats: Add X mana of any one color."), true);
  assert.equal(outlet("{T}, Sacrifice this land: Draw a card."), false);
  // Hellion Crucible's cost.
  assert.equal(
    outlet("{1}{R}, {T}, Remove two pressure counters from this land and sacrifice it: Create a 4/4 red Hellion creature token."),
    false
  );
  // A sacrifice in a trigger is not a cost.
  assert.equal(outlet("When this land enters, sacrifice a creature."), false);
});

test("isBasicLand: the Basic supertype, not a basic land type", () => {
  assert.equal(isBasicLand("Basic Land — Plains"), true);
  assert.equal(isBasicLand("Basic Snow Land — Forest"), true);
  assert.equal(isBasicLand("Basic Land"), true);
  assert.equal(isBasicLand("Land — Island"), false);
  assert.equal(isBasicLand("Land — Forest Plains"), false);
  assert.equal(isBasicLand("Sorcery // Land"), false);
});

test("isLand: every fixture in EXPECTED is a land, every NOT_LANDS one isn't", () => {
  for (const name of Object.keys(EXPECTED)) assert.equal(isLand(land(name)), true, name);
  for (const name of NOT_LANDS) assert.equal(isLand(land(name)), false, name);
  assert.equal(isLand({ ...land("Plains"), typeLine: "Artifact", faces: undefined }), false);
});

test("isLand: a modal DFC counts by either face, a transform card by its front", () => {
  assert.equal(land("Bridgeworks Battle // Tanglespan Bridgeworks").layout, "modal_dfc");
  assert.equal(land("Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun").layout, "transform");
  assert.equal(land("Westvale Abbey // Ormendahl, Profane Prince").layout, "transform");
  // Before layout is synced, any land face counts — the old behaviour.
  const unsynced = { ...land("Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun"), layout: null };
  assert.equal(isLand(unsynced), true);
});

test("mdfc: needs the modal_dfc layout once layout is known", () => {
  const abbey = land("Westvale Abbey // Ormendahl, Profane Prince");
  const mdfc = LAND_CAPABILITIES.find((c) => c.id === "mdfc")!;
  assert.equal(mdfc.test(abbey, landColours(abbey, WUBRG)), false);
  // The face heuristic alone would have called it one.
  const unsynced = { ...abbey, layout: null };
  assert.equal(mdfc.test(unsynced, landColours(unsynced, WUBRG)), true);
});

test("landColours: off-identity colours are dropped", () => {
  assert.deepEqual(columns(land("Temple Garden"), ["W", "U"]), ["W"]);
  assert.deepEqual(columns(land("Plains"), ["G"]), []);
  assert.deepEqual(columns(land("Windswept Heath"), WUBRG), ["W", "G"]);
});

test("landColours: colourless is kept whatever the identity", () => {
  assert.deepEqual(columns(land("Wastes"), ["W"]), ["C"]);
  assert.deepEqual(columns(land("Phyrexian Tower"), ["B", "G"]), ["B", "C"]);
  assert.deepEqual(columns(land("Maze of Ith"), WUBRG), []);
});

test("landColours: any = flexible, or covers a multicolour identity", () => {
  assert.deepEqual(columns(land("Command Tower"), ["G"]), ["G", "any"]);
  assert.deepEqual(columns(land("Evolving Wilds"), ["U", "B"]), ["U", "B", "any"]);
  assert.deepEqual(columns(land("Temple Garden"), ["G", "W"]), ["W", "G", "any"]);
  assert.deepEqual(columns(land("Cabaretti Courtyard"), ["W", "R", "G"]), ["W", "R", "G", "any"]);
  assert.deepEqual(columns(land("Cabaretti Courtyard"), WUBRG), ["W", "R", "G"]);
  // A mono-coloured deck's basics are not "any".
  assert.deepEqual(columns(land("Snow-Covered Forest"), ["G"]), ["G"]);
});

test("landColours: restricted mana is not a colour source", () => {
  // Scryfall lists both as all five colours.
  assert.deepEqual(land("Castle Doom").producedMana, ["B", "C", "G", "R", "U", "W"]);
  assert.deepEqual(columns(land("Castle Doom"), WUBRG), ["C"]);
  assert.deepEqual(columns(land("Haven of the Spirit Dragon"), WUBRG), ["C"]);
});

test("landColours: falls back to oracle text when producedMana is empty", () => {
  const unsynced = (name: string) => ({ ...land(name), producedMana: [] });
  // Reminder text is the only mana ability on typed duals.
  assert.deepEqual(columns(unsynced("Temple Garden"), WUBRG), ["W", "G"]);
  assert.deepEqual(columns(unsynced("Volatile Fjord"), WUBRG), ["U", "R"]);
  assert.deepEqual(columns(unsynced("City of Brass"), WUBRG), ["W", "U", "B", "R", "G", "any"]);
  // MDFC mana lives on the land face.
  assert.deepEqual(columns(unsynced("Bridgeworks Battle // Tanglespan Bridgeworks"), WUBRG), ["G"]);
});
