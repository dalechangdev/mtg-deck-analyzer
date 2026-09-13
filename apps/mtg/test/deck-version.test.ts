/**
 * The pure arithmetic behind the version compare page. No database: every case
 * builds its card lists inline.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { DeckEntry } from "@/lib/commander";
import {
  curveAverage,
  curveBins,
  diffVersions,
  versionStats,
  winRate,
} from "@/lib/deck-version";

let nextRow = 0;

/** A main-deck row for a 2-drop green creature unless told otherwise. */
function card(name: string, overrides: Partial<DeckEntry> = {}): DeckEntry {
  nextRow += 1;
  return {
    deckCardId: `row-${nextRow}`,
    cardId: `card-${name}`,
    name,
    manaCost: null,
    cmc: 2,
    typeLine: "Creature — Elf",
    oracleText: null,
    colorIdentity: ["G"],
    keywords: [],
    canBeCommander: false,
    imageUrl: null,
    isCommander: false,
    quantity: 1,
    slot: "main",
    ...overrides,
  };
}

test("diffVersions: a fresh copy diffs as unchanged even though its row ids are new", () => {
  const from = [card("Sol Ring"), card("Llanowar Elves")];
  const to = [card("Sol Ring"), card("Llanowar Elves")];

  const diff = diffVersions(from, to);

  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changedQuantity, []);
  assert.equal(diff.unchangedCount, 2);
});

test("diffVersions: added, removed and count changes, each sorted by name", () => {
  const from = [
    card("Sol Ring"),
    card("Llanowar Elves"),
    card("Forest", { typeLine: "Basic Land — Forest", quantity: 5 }),
    card("Birds of Paradise"),
  ];
  const to = [
    card("Sol Ring"),
    card("Elvish Mystic"),
    card("Forest", { typeLine: "Basic Land — Forest", quantity: 7 }),
    card("Arbor Elf"),
  ];

  const diff = diffVersions(from, to);

  assert.deepEqual(diff.added.map((c) => c.name), ["Arbor Elf", "Elvish Mystic"]);
  assert.deepEqual(diff.removed.map((c) => c.name), ["Birds of Paradise", "Llanowar Elves"]);
  assert.deepEqual(
    diff.changedQuantity.map(({ name, from, to }) => ({ name, from, to })),
    [{ name: "Forest", from: 5, to: 7 }]
  );
  assert.equal(diff.unchangedCount, 1);
});

test("diffVersions: potential and wishlist piles don't count as deck changes", () => {
  const from = [card("Sol Ring")];
  const to = [
    card("Sol Ring"),
    card("Cultivate", { slot: "maybe" }),
    card("Mana Crypt", { slot: "wishlist" }),
  ];

  const diff = diffVersions(from, to);

  assert.deepEqual(diff.added, []);
  assert.equal(diff.unchangedCount, 1);
});

test("diffVersions: a card promoted from potential to main is an addition", () => {
  const from = [card("Sol Ring"), card("Cultivate", { slot: "maybe" })];
  const to = [card("Sol Ring"), card("Cultivate")];

  assert.deepEqual(diffVersions(from, to).added.map((c) => c.name), ["Cultivate"]);
});

test("diffVersions: reports a commander swap", () => {
  const from = [card("Omnath", { isCommander: true }), card("Sol Ring")];
  const to = [card("Tatyova", { isCommander: true }), card("Sol Ring")];

  const diff = diffVersions(from, to);

  assert.deepEqual(diff.commander, { from: "Omnath", to: "Tatyova" });
  assert.deepEqual(diff.added.map((c) => [c.name, c.isCommander]), [["Tatyova", true]]);
  assert.deepEqual(diff.removed.map((c) => [c.name, c.isCommander]), [["Omnath", true]]);
});

test("curveBins: fixed bins in order, commander and non-main slots left out", () => {
  const bins = curveBins([
    card("Omnath", { isCommander: true, cmc: 4 }),
    card("Forest", { typeLine: "Basic Land — Forest", quantity: 2 }),
    card("Dryad Arbor", { typeLine: "Land Creature — Forest Dryad", cmc: 0 }),
    card("Llanowar Elves", { cmc: 1 }),
    card("Craterhoof Behemoth", { cmc: 8 }),
    card("Cultivate", { slot: "maybe", cmc: 3 }),
  ]);

  assert.deepEqual(
    bins.map((b) => b.label),
    ["Land", "0", "1", "2", "3", "4", "5", "6", "7+"]
  );
  const count = (label: string) => bins.find((b) => b.label === label)?.count;
  assert.equal(count("Land"), 3, "Dryad Arbor sits with the lands");
  assert.equal(count("1"), 1);
  assert.equal(count("3"), 0, "the potential pile isn't drawn");
  assert.equal(count("4"), 0, "the commander isn't drawn");
  assert.equal(count("7+"), 1);
});

test("curveAverage: counts 7+ as 7 and ignores lands; null with no spells", () => {
  const bins = curveBins([
    card("Forest", { typeLine: "Basic Land — Forest", quantity: 10 }),
    card("Llanowar Elves", { cmc: 1 }),
    card("Craterhoof Behemoth", { cmc: 8 }),
  ]);
  assert.equal(curveAverage(bins), 4);

  assert.equal(curveAverage(curveBins([card("Forest", { typeLine: "Basic Land — Forest" })])), null);
});

test("versionStats: counts the commander in the 100 but nowhere else", () => {
  const stats = versionStats([
    card("Omnath", { isCommander: true, cmc: 4, oracleText: "Add {G}." }),
    card("Forest", { typeLine: "Basic Land — Forest", quantity: 2 }),
    card("Llanowar Elves", { cmc: 1, oracleText: "{T}: Add {G}." }),
    card("Craterhoof Behemoth", { cmc: 8 }),
    card("Cultivate", { slot: "maybe", cmc: 3 }),
  ]);

  assert.equal(stats.mainCount, 5);
  assert.equal(stats.lands, 2);
  assert.equal(stats.spells, 2);
  assert.equal(stats.averageCmc, 4);
  assert.equal(stats.ramp, 1, "Llanowar Elves ramps; the commander isn't counted");
  assert.equal(stats.categories.Creatures, 2);
  assert.equal(stats.categories.Lands, 2);
});

test("versionStats: an empty version", () => {
  const stats = versionStats([]);
  assert.equal(stats.mainCount, 0);
  assert.equal(stats.averageCmc, null);
  assert.equal(stats.ramp, 0);
});

test("winRate: over games with a result, draws counting against", () => {
  assert.equal(winRate({ wins: 0, losses: 0, draws: 0 }), null);
  assert.equal(winRate({ wins: 2, losses: 1, draws: 0 }), 2 / 3);
  assert.equal(winRate({ wins: 1, losses: 0, draws: 1 }), 0.5);
});
