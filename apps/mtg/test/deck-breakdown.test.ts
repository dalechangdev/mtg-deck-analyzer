/**
 * The analysis page's cross-tab. Cards are built inline — only type line, mana
 * value, identity and quantity matter here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { DeckEntry } from "@/lib/commander";
import {
  ALL,
  NO_ROLE,
  breakdownDeck,
  cellKey,
  groupByType,
  type RoleContext,
} from "@/lib/deck-breakdown";

let nextRow = 0;

function card(
  name: string,
  typeLine: string,
  cmc: number,
  colorIdentity: string[],
  overrides: Partial<DeckEntry> = {}
): DeckEntry {
  nextRow += 1;
  return {
    deckCardId: `row-${nextRow}`,
    cardId: name,
    name,
    manaCost: null,
    cmc,
    typeLine,
    oracleText: null,
    colorIdentity,
    keywords: [],
    canBeCommander: false,
    imageUrl: null,
    isCommander: false,
    quantity: 1,
    slot: "main",
    ...overrides,
  };
}

const NO_ROLES: RoleContext = { roles: [], rolesByCard: new Map() };

const DECK = [
  card("Commander", "Legendary Creature — Elf", 3, ["G", "U"], { isCommander: true }),
  card("Llanowar Elves", "Creature — Elf Druid", 1, ["G"]),
  card("Counterspell", "Instant", 2, ["U"]),
  card("Cultivate", "Sorcery", 3, ["G"]),
  card("Solemn Simulacrum", "Artifact Creature — Golem", 4, []),
  card("Hydroid Krasis", "Creature — Jellyfish Hydra Beast", 0, ["G", "U"]),
  card("Craterhoof Behemoth", "Creature — Beast", 8, ["G"]),
  card("Forest", "Basic Land — Forest", 0, [], { quantity: 8 }),
  card("Rampant Growth", "Sorcery", 2, ["G"], { slot: "maybe" }),
];

const count = (b: ReturnType<typeof breakdownDeck>, row: string, column: string) =>
  b.cells.get(cellKey(row, column))?.count ?? 0;

test("main deck only, commander excluded, copies counted", () => {
  const b = breakdownDeck(DECK, "type", "none", NO_ROLES);
  assert.equal(b.total.count, 14);
  assert.ok(!b.total.cardIds.includes("Commander"));
  assert.ok(!b.total.cardIds.includes("Rampant Growth"));
  assert.equal(count(b, "Lands", ALL), 8);
});

test("type is exclusive and follows the deck panel's order", () => {
  const b = breakdownDeck(DECK, "type", "none", NO_ROLES);
  assert.deepEqual(
    b.rows.map((r) => r.key),
    ["Creatures", "Instants", "Sorceries", "Lands"]
  );
  // An artifact creature is a creature, as in every other deck view.
  assert.equal(count(b, "Creatures", ALL), 4);
});

test("mana value keeps interior gaps and caps at 7+", () => {
  const b = breakdownDeck(DECK, "none", "cmc", NO_ROLES);
  assert.deepEqual(
    b.columns.map((c) => c.label),
    ["0", "1", "2", "3", "4", "5", "6", "7+"]
  );
  assert.equal(b.columnTotals.get("7")?.count, 1);
  assert.equal(b.columnTotals.get("5"), undefined);
});

test("color buckets: mono, multicolor, colorless", () => {
  const b = breakdownDeck(DECK, "color", "none", NO_ROLES);
  assert.deepEqual(
    b.rows.map((r) => r.key),
    ["U", "G", "multi", "C"]
  );
  assert.equal(b.rowTotals.get("C")?.count, 9);
});

test("role is multi-valued: totals count distinct cards, not cell sums", () => {
  const ctx: RoleContext = {
    roles: [
      { id: "ramp", name: "Ramp" },
      { id: "draw", name: "Card Advantage" },
    ],
    rolesByCard: new Map([
      ["Llanowar Elves", new Set(["ramp"])],
      ["Cultivate", new Set(["ramp"])],
      ["Solemn Simulacrum", new Set(["draw", "ramp"])],
    ]),
  };
  const b = breakdownDeck(DECK, "role", "type", ctx);
  assert.deepEqual(
    b.rows.map((r) => r.key),
    ["ramp", "draw", NO_ROLE]
  );
  assert.equal(count(b, "ramp", "Creatures"), 2);
  assert.equal(count(b, "draw", "Creatures"), 1);
  // Solemn appears in two role rows but once in the Creatures column.
  assert.equal(b.columnTotals.get("Creatures")?.count, 4);
  assert.equal(b.total.count, 14);
});

test("groupByType drops empty groups", () => {
  const groups = groupByType(DECK.filter((c) => c.cmc === 0));
  assert.deepEqual(
    groups.map((g) => g.category),
    ["Creatures", "Lands"]
  );
});
