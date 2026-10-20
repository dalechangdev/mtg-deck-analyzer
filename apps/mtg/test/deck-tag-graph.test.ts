/**
 * The breakdown's graph mode: which tags and cards survive pruning, and how
 * they link. Cards are built inline — only tags, identity and quantity matter.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { DeckEntry } from "@/lib/commander";
import { buildTagGraph, cardNodeId, tagNodeId } from "@/lib/deck-tag-graph";

function card(name: string, oracleTags: string[], overrides: Partial<DeckEntry> = {}): DeckEntry {
  return {
    deckCardId: `row-${name}`,
    cardId: name,
    name,
    manaCost: null,
    cmc: 2,
    typeLine: "Creature",
    oracleText: null,
    colorIdentity: ["G"],
    keywords: [],
    canBeCommander: false,
    imageUrl: null,
    isCommander: false,
    quantity: 1,
    slot: "main",
    oracleTags,
    ...overrides,
  };
}

const DECK = [
  card("Commander", ["ramp", "draw"], { isCommander: true }),
  card("Llanowar Elves", ["ramp", "mana dork"]),
  card("Cultivate", ["ramp", "land ramp"]),
  card("Solemn Simulacrum", ["ramp", "land ramp", "draw"], { colorIdentity: [] }),
  card("Hydroid Krasis", ["draw"], { colorIdentity: ["G", "U"] }),
  card("Forest", [], { quantity: 8 }),
  card("Rampant Growth", ["ramp"], { slot: "maybe" }),
];

const ids = (g: ReturnType<typeof buildTagGraph>, kind: "tag" | "card") =>
  g.nodes.filter((n) => n.kind === kind).map((n) => n.id);

test("tags below the threshold drop out, and so do cards left with none", () => {
  const g = buildTagGraph(DECK, { minCards: 2, maxTags: 10 });
  assert.deepEqual(ids(g, "tag"), [tagNodeId("ramp"), tagNodeId("draw"), tagNodeId("land ramp")]);
  // Forest has no tags; the commander and the potential pile are never drawn.
  assert.deepEqual(ids(g, "card"), [
    cardNodeId("Cultivate"),
    cardNodeId("Hydroid Krasis"),
    cardNodeId("Llanowar Elves"),
    cardNodeId("Solemn Simulacrum"),
  ]);
  assert.equal(g.hiddenCards, 1);
  assert.equal(g.totalTags, 4);
});

test("links run card to tag, only for shown tags", () => {
  const g = buildTagGraph(DECK, { minCards: 2, maxTags: 10 });
  const solemn = g.links.filter((l) => l.source === cardNodeId("Solemn Simulacrum"));
  assert.deepEqual(solemn.map((l) => l.target).sort(), [
    tagNodeId("draw"),
    tagNodeId("land ramp"),
    tagNodeId("ramp"),
  ]);
  assert.ok(!g.links.some((l) => l.target === tagNodeId("mana dork")));
});

test("maxTags keeps the most common; filter narrows by label", () => {
  assert.deepEqual(ids(buildTagGraph(DECK, { minCards: 1, maxTags: 1 }), "tag"), [tagNodeId("ramp")]);
  const filtered = buildTagGraph(DECK, { minCards: 1, maxTags: 10, filter: " RAMP" });
  assert.deepEqual(ids(filtered, "tag"), [tagNodeId("ramp"), tagNodeId("land ramp")]);
  assert.equal(filtered.hiddenCards, 2); // Hydroid Krasis and Forest
});

test("card colour is identity: mono, multi, colourless", () => {
  const g = buildTagGraph(DECK, { minCards: 1, maxTags: 10 });
  const color = (name: string) =>
    g.nodes.find((n) => n.id === cardNodeId(name) && n.kind === "card") as { color: string };
  assert.equal(color("Cultivate").color, "G");
  assert.equal(color("Hydroid Krasis").color, "multi");
  assert.equal(color("Solemn Simulacrum").color, "C");
});
