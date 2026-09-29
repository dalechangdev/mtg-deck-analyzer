/**
 * Pip counting for the cost-colour histogram. No database: every card is inline.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCostPips, pipsInCost, type PipCard } from "@/lib/mana-pips";

function card(name: string, manaCost: string | null, overrides: Partial<PipCard> = {}): PipCard {
  return { name, manaCost, typeLine: "Instant", quantity: 1, ...overrides };
}

const pips = (analysis: ReturnType<typeof analyzeCostPips>) =>
  Object.fromEntries(analysis.bins.map((b) => [b.color, b.pips]));

test("pipsInCost: counts each coloured symbol, ignoring generic, X and snow", () => {
  assert.deepEqual(pipsInCost("{X}{2}{S}{G}{G}{U}"), { W: 0, U: 1, B: 0, R: 0, G: 2, C: 0 });
});

test("pipsInCost: hybrid counts toward both colours, phyrexian and twobrid toward theirs", () => {
  assert.deepEqual(pipsInCost("{W/U}{B/P}{2/R}{G/U/P}"), { W: 1, U: 2, B: 1, R: 1, G: 1, C: 0 });
});

test("pipsInCost: {C} is its own pip; a null cost has none", () => {
  assert.equal(pipsInCost("{C}{C}{4}").C, 2);
  assert.deepEqual(Object.values(pipsInCost(null)), [0, 0, 0, 0, 0, 0]);
});

test("pipsInCost: both halves of a split card count", () => {
  assert.deepEqual(pipsInCost("{1}{R} // {2}{U}"), { W: 0, U: 1, B: 0, R: 1, G: 0, C: 0 });
});

test("analyzeCostPips: skips lands and non-main rows, multiplies by quantity", () => {
  const analysis = analyzeCostPips([
    card("Counterspell", "{U}{U}", { quantity: 2 }),
    card("Island", null, { typeLine: "Basic Land — Island", quantity: 10 }),
    card("Dryad Arbor", null, { typeLine: "Land Creature — Forest Dryad" }),
    card("Llanowar Elves", "{G}", { slot: "maybe" }),
  ]);
  assert.equal(pips(analysis).U, 4);
  assert.equal(pips(analysis).G, 0);
  assert.equal(analysis.spellCount, 2);
  assert.equal(analysis.totalPips, 4);
});

test("analyzeCostPips: a spell with a land back face is still a spell", () => {
  const analysis = analyzeCostPips([
    card("Growing Rites of Itlimoc", "{2}{G}", {
      typeLine: "Legendary Enchantment // Legendary Land",
    }),
  ]);
  assert.equal(pips(analysis).G, 1);
});

test("analyzeCostPips: cards per colour count copies, names sort by pips", () => {
  const analysis = analyzeCostPips([
    card("Llanowar Elves", "{G}"),
    card("Craterhoof Behemoth", "{5}{G}{G}{G}"),
    card("Simic Signet", "{2}"),
  ]);
  const green = analysis.bins.find((b) => b.color === "G");
  assert.equal(green?.cards, 2);
  assert.deepEqual(green?.cardNames, ["Craterhoof Behemoth", "Llanowar Elves"]);
  assert.equal(analysis.spellCount, 3);
});
