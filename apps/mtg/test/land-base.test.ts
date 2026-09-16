/**
 * The land base matrix's counting. No database: lands come from the real rows
 * in test/fixtures/lands.ts, and the commander is built inline.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { DeckEntry } from "@/lib/commander";
import { LAND_CAPABILITIES } from "@/lib/land-capabilities";
import {
  analyzeLandBase,
  withPotentialPromoted,
  type LandBaseAnalysis,
  type LandBaseRow,
} from "@/lib/land-base";
import { LANDS } from "./fixtures/lands";

let nextRow = 0;

/** A main-deck row for a fixture land unless told otherwise. */
function entry(name: string, overrides: Partial<DeckEntry> = {}): DeckEntry {
  const card = LANDS[name];
  assert.ok(card, `no fixture named ${name}`);
  nextRow += 1;
  return {
    ...card,
    deckCardId: `row-${nextRow}`,
    isCommander: false,
    quantity: 1,
    slot: "main",
    ...overrides,
  };
}

function commander(colorIdentity: string[]): DeckEntry {
  nextRow += 1;
  return {
    deckCardId: `row-${nextRow}`,
    cardId: `commander-${nextRow}`,
    name: "Test Commander",
    manaCost: null,
    cmc: 4,
    typeLine: "Legendary Creature — Elf",
    oracleText: null,
    colorIdentity,
    keywords: [],
    canBeCommander: true,
    imageUrl: null,
    isCommander: true,
    quantity: 1,
    slot: "main",
  };
}

function row(analysis: LandBaseAnalysis, capabilityId: string): LandBaseRow {
  const found = analysis.rows.find((r) => r.capabilityId === capabilityId);
  assert.ok(found, `no row ${capabilityId}`);
  return found;
}

function counts(cells: LandBaseAnalysis["sources"]): Record<string, number> {
  return Object.fromEntries(Object.entries(cells).map(([column, cell]) => [column, cell!.count]));
}

test("columns: identity in WUBRG order, then C and any", () => {
  const analysis = analyzeLandBase([commander(["G", "W"]), entry("Plains")]);
  assert.deepEqual(analysis.identity, ["W", "G"]);
  assert.deepEqual(analysis.columns, ["W", "G", "C", "any"]);
});

test("every capability gets a row, in order, even at zero", () => {
  const analysis = analyzeLandBase([commander(["G"])]);
  assert.deepEqual(
    analysis.rows.map((r) => r.capabilityId),
    LAND_CAPABILITIES.map((c) => c.id)
  );
  assert.equal(analysis.landCount, 0);
  assert.deepEqual(counts(row(analysis, "nonbasic").cells), { G: 0, C: 0, any: 0 });
});

test("a dual counts once in each colour it makes, once in its row total", () => {
  const analysis = analyzeLandBase([commander(["G", "W"]), entry("Temple Garden")]);
  const multi = row(analysis, "multi");
  // It also produces every identity colour, so it's an "any" source in G/W.
  assert.deepEqual(counts(multi.cells), { W: 1, G: 1, C: 0, any: 1 });
  assert.equal(multi.total.count, 1);
  assert.deepEqual(multi.total.cardIds, ["temple-garden"]);
  assert.deepEqual(counts(analysis.sources), { W: 1, G: 1, C: 0, any: 1 });
  assert.equal(analysis.landCount, 1);
});

test("copies are weighted by quantity", () => {
  const analysis = analyzeLandBase([
    commander(["G", "W"]),
    entry("Plains", { quantity: 12 }),
    entry("Snow-Covered Forest", { quantity: 3 }),
  ]);
  const basic = row(analysis, "basic");
  assert.deepEqual(counts(basic.cells), { W: 12, G: 3, C: 0 });
  assert.equal(basic.total.count, 15);
  assert.deepEqual(basic.total.cardIds, ["plains", "snow-covered-forest"]);
  assert.equal(analysis.landCount, 15);
});

test("basic × any is not applicable; other rows keep the any cell", () => {
  const analysis = analyzeLandBase([commander(["G", "W"]), entry("Plains")]);
  assert.equal("any" in row(analysis, "basic").cells, false);
  assert.ok(row(analysis, "nonbasic").cells.any);
});

test("the potential pile, the commander and non-lands don't count", () => {
  const elf: DeckEntry = { ...commander(["G"]), isCommander: false, cardId: "elf" };
  const analysis = analyzeLandBase([
    commander(["G", "W"]),
    entry("Temple Garden"),
    entry("Snow-Covered Forest", { slot: "maybe" }),
    entry("Plains", { slot: "wishlist" }),
    elf,
  ]);
  assert.equal(analysis.landCount, 1);
  assert.deepEqual(analysis.sources.G, { count: 1, cardIds: ["temple-garden"] });
});

test("a transform card with a land back is not a land", () => {
  const analysis = analyzeLandBase([
    commander(["G"]),
    entry("Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun"),
  ]);
  assert.equal(analysis.landCount, 0);
});

test("colours outside the identity are dropped", () => {
  const analysis = analyzeLandBase([commander(["G", "W"]), entry("Overgrown Tomb")]);
  assert.deepEqual(counts(analysis.sources), { W: 0, G: 1, C: 0, any: 0 });
});

test("a colourless commander gets only the C and any columns", () => {
  const analysis = analyzeLandBase([commander([]), entry("Wastes"), entry("Command Tower")]);
  assert.deepEqual(analysis.columns, ["C", "any"]);
  assert.deepEqual(counts(analysis.sources), { C: 1, any: 1 });
});

test("with no commander, the lands' identities stand in", () => {
  const analysis = analyzeLandBase([entry("Temple Garden"), entry("Volatile Fjord")]);
  assert.deepEqual(analysis.identity, ["W", "U", "R", "G"]);
});

test("a row synced before producedMana still counts, from oracle text", () => {
  const analysis = analyzeLandBase([
    commander(["G", "W"]),
    entry("Temple Garden", { producedMana: [] }),
  ]);
  assert.deepEqual(counts(analysis.sources), { W: 1, G: 1, C: 0, any: 1 });
});

test("withPotentialPromoted: the pile counts, the wishlist doesn't", () => {
  const entries = [
    commander(["G", "W"]),
    entry("Temple Garden"),
    entry("Snow-Covered Forest", { slot: "maybe", quantity: 2 }),
    entry("Plains", { slot: "wishlist" }),
  ];
  const live = analyzeLandBase(entries);
  const preview = analyzeLandBase(withPotentialPromoted(entries));

  assert.equal(live.landCount, 1);
  assert.equal(preview.landCount, 3);
  assert.deepEqual(counts(live.sources), { W: 1, G: 1, C: 0, any: 1 });
  assert.deepEqual(counts(preview.sources), { W: 1, G: 3, C: 0, any: 1 });
  // The promoted basics land in the basic row, not just the totals.
  assert.equal(row(preview, "basic").total.count, 2);
});

test("withPotentialPromoted: leaves the caller's entries alone", () => {
  const entries = [commander(["G"]), entry("Snow-Covered Forest", { slot: "maybe" })];
  const promoted = withPotentialPromoted(entries);
  assert.equal(entries[1].slot, "maybe");
  assert.equal(promoted[1].slot, "main");
  assert.notEqual(entries[1], promoted[1]);
});

test("producesNothingIds: no colour and no fetch", () => {
  const analysis = analyzeLandBase([
    commander(["W", "U", "B", "R", "G"]),
    entry("Maze of Ith"),
    entry("Evolving Wilds"),
    entry("Reliquary Tower"),
  ]);
  assert.deepEqual(analysis.producesNothingIds, ["maze-of-ith"]);
});
