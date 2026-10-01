import assert from "node:assert/strict";
import test from "node:test";

import { isBasicLand, nameCandidates, parseDecklist } from "../src/lib/decklist";

test("parses Moxfield plain-text lines with set and collector number", () => {
  const { lines, unparsed } = parseDecklist("1 Sol Ring (CMM) 410\n2 Arcane Signet (M3C) 283\n");
  assert.deepEqual(unparsed, []);
  assert.deepEqual(lines, [
    { quantity: 1, name: "Sol Ring", setCode: "cmm", board: "mainboard" },
    { quantity: 2, name: "Arcane Signet", setCode: "m3c", board: "mainboard" },
  ]);
});

test("accepts bare names, 1x quantities and foil marks", () => {
  const { lines } = parseDecklist("Forest\n1x Swords to Plowshares\n1 Smothering Tithe (RNA) 22 *F*\n");
  assert.deepEqual(
    lines.map((l) => [l.quantity, l.name, l.setCode]),
    [
      [1, "Forest", null],
      [1, "Swords to Plowshares", null],
      [1, "Smothering Tithe", "rna"],
    ]
  );
});

test("keeps collector numbers with letters and stars out of the name", () => {
  const { lines } = parseDecklist("1 Lightning Bolt (SLD) 123a\n1 Counterspell (PLST) 2XM-51\n");
  assert.deepEqual(lines.map((l) => l.name), ["Lightning Bolt", "Counterspell"]);
});

test("keeps DFC and split names whole", () => {
  const { lines } = parseDecklist("1 Fire // Ice (MH2) 290\n1 Delver of Secrets / Insectile Aberration\n");
  assert.deepEqual(lines.map((l) => l.name), [
    "Fire // Ice",
    "Delver of Secrets / Insectile Aberration",
  ]);
});

test("routes commander sections and drops sideboard and maybeboard", () => {
  const text = [
    "Commander",
    "1 Atraxa, Praetors' Voice (C16) 28",
    "",
    "Deck",
    "1 Sol Ring",
    "SIDEBOARD:",
    "1 Rhystic Study",
    "// Maybeboard",
    "1 Cyclonic Rift",
  ].join("\n");
  const { lines, unparsed } = parseDecklist(text);
  assert.deepEqual(unparsed, []);
  assert.deepEqual(
    lines.map((l) => [l.board, l.name]),
    [
      ["commanders", "Atraxa, Praetors' Voice"],
      ["mainboard", "Sol Ring"],
    ]
  );
});

test("merges repeated lines and skips comments", () => {
  const { lines } = parseDecklist("// my deck\n10 Island\n5 Island\n# note\n");
  assert.deepEqual(lines, [{ quantity: 15, name: "Island", setCode: null, board: "mainboard" }]);
});

test("reports lines it cannot read", () => {
  const { lines, unparsed } = parseDecklist("0 Sol Ring\n");
  assert.deepEqual(lines, []);
  assert.deepEqual(unparsed, ["0 Sol Ring"]);
});

test("isBasicLand covers snow basics and Wastes, not nonbasics", () => {
  assert.ok(isBasicLand("Snow-Covered Island"));
  assert.ok(isBasicLand("wastes"));
  assert.ok(!isBasicLand("Command Tower"));
});

test("nameCandidates offers the Scryfall spelling and the front face", () => {
  assert.deepEqual(nameCandidates("Delver of Secrets / Insectile Aberration"), [
    "Delver of Secrets / Insectile Aberration",
    "Delver of Secrets // Insectile Aberration",
    "Delver of Secrets",
  ]);
  assert.deepEqual(nameCandidates("Sol Ring"), ["Sol Ring"]);
});
