/**
 * Candidate selection for the template builder. No database: the pool is a
 * handful of inline cards classified by the real role matchers.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { ClassifiableCard, Role } from "@/lib/deck-template";
import {
  isManualOnly,
  roleMatchSet,
  selectCandidates,
  type CandidateQuery,
} from "@/lib/template-candidates";

function card(name: string, overrides: Partial<ClassifiableCard> = {}): ClassifiableCard {
  return {
    cardId: name,
    name,
    manaCost: null,
    cmc: 2,
    typeLine: "Artifact",
    oracleText: null,
    colorIdentity: [],
    keywords: [],
    canBeCommander: false,
    imageUrl: null,
    themeIds: [],
    ...overrides,
  };
}

const ramp: Role = {
  id: "ramp",
  name: "Ramp",
  matchers: [{ kind: "CLASSIFIER", value: "isManaRamp" }],
};
const draw: Role = {
  id: "card-advantage",
  name: "Card Advantage",
  matchers: [{ kind: "CLASSIFIER", value: "isCardAdvantage" }],
};
const land: Role = {
  id: "land",
  name: "Land",
  matchers: [{ kind: "TYPE_LINE", value: "Land" }],
};
const identity: Role = {
  id: "identity",
  name: "Identity / Plan",
  matchers: [{ kind: "MANUAL_ONLY", value: "" }],
};

const pool = [
  card("Sol Ring", { cmc: 1, oracleText: "{T}: Add {C}{C}." }),
  card("Arcane Signet", { oracleText: "{T}: Add one mana of any color in your commander's color identity." }),
  card("Cultivate", {
    cmc: 3,
    typeLine: "Sorcery",
    colorIdentity: ["G"],
    oracleText: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",
  }),
  card("Dockside Extortionist", {
    typeLine: "Creature — Goblin Pirate",
    colorIdentity: ["R"],
    oracleText: "When this creature enters, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control.",
  }),
  card("Mind Stone", {
    oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.",
  }),
  card("Divination", {
    cmc: 3,
    typeLine: "Sorcery",
    colorIdentity: ["U"],
    oracleText: "Draw two cards.",
  }),
  card("Forest", { cmc: 0, typeLine: "Basic Land — Forest", colorIdentity: ["G"], oracleText: "({T}: Add {G}.)" }),
];

const matchSetFor = (role: Role) => roleMatchSet(pool, role);

function query(overrides: Partial<CandidateQuery> = {}): CandidateQuery {
  return {
    role: ramp,
    templateRoles: [land, ramp, draw, identity],
    gapRoleIds: new Set(["ramp", "card-advantage"]),
    identity: ["G", "U"],
    deck: [],
    overrides: new Map(),
    ownedIds: new Set(),
    text: "",
    ownedOnly: false,
    ...overrides,
  };
}

const names = (q: CandidateQuery) => selectCandidates(pool, q, matchSetFor).map((c) => c.card.name);

test("isManualOnly: a role with only MANUAL_ONLY matchers can't be auto-filled", () => {
  assert.equal(isManualOnly(identity), true);
  assert.equal(isManualOnly(ramp), false);
});

test("selectCandidates: only cards that fill the role and fit the identity", () => {
  // Dockside is ramp but red; Divination is blue but not ramp.
  assert.deepEqual(names(query()), ["Mind Stone", "Sol Ring", "Arcane Signet", "Cultivate"]);
});

test("selectCandidates: double duty toward another gap ranks first", () => {
  const [first] = selectCandidates(pool, query(), matchSetFor);
  assert.equal(first.card.name, "Mind Stone");
  assert.deepEqual(first.alsoFills, ["card-advantage"]);
});

test("selectCandidates: a met requirement no longer earns the double-duty bump", () => {
  assert.deepEqual(names(query({ gapRoleIds: new Set(["ramp"]) })), [
    "Sol Ring",
    "Arcane Signet",
    "Mind Stone",
    "Cultivate",
  ]);
});

test("selectCandidates: owned cards come before unowned at equal double duty", () => {
  const ranked = names(query({ gapRoleIds: new Set(), ownedIds: new Set(["Cultivate"]) }));
  assert.equal(ranked[0], "Cultivate");
});

test("selectCandidates: cards already in the main deck drop out, basics excepted", () => {
  const deck = [
    { cardId: "Sol Ring", slot: "main" as const },
    { cardId: "Forest", slot: "main" as const },
  ];
  assert.ok(!names(query({ deck })).includes("Sol Ring"));
  assert.ok(names(query({ role: land, deck })).includes("Forest"));
});

test("selectCandidates: a card parked in Potential is listed and flagged", () => {
  const candidates = selectCandidates(
    pool,
    query({ deck: [{ cardId: "Cultivate", slot: "maybe" }] }),
    matchSetFor
  );
  assert.equal(candidates.find((c) => c.card.name === "Cultivate")?.inSlot, "maybe");
});

test("selectCandidates: deck overrides win over classification in both directions", () => {
  const overrides = new Map([
    ["Sol Ring:ramp", "EXCLUDED" as const],
    ["Divination:ramp", "INCLUDED" as const],
  ]);
  const ranked = names(query({ overrides }));
  assert.ok(!ranked.includes("Sol Ring"));
  assert.ok(ranked.includes("Divination"));
});

test("selectCandidates: no commander means no identity filter", () => {
  assert.ok(names(query({ identity: null })).includes("Dockside Extortionist"));
});

test("selectCandidates: a manual-only role is a text search over the whole pool", () => {
  assert.deepEqual(names(query({ role: identity, text: "draw" })), ["Mind Stone", "Divination"]);
});

test("selectCandidates: ownedOnly hides everything not in the library", () => {
  assert.deepEqual(names(query({ ownedOnly: true, ownedIds: new Set(["Sol Ring"]) })), ["Sol Ring"]);
});

test("selectCandidates: lands sort after spells for a non-land role", () => {
  const withLand = [
    ...pool,
    card("Tireless Tracker's Den", { cmc: 0, typeLine: "Land", oracleText: "{2}, {T}: Draw a card." }),
  ];
  const ranked = selectCandidates(
    withLand,
    query({ role: draw, gapRoleIds: new Set() }),
    (role) => roleMatchSet(withLand, role)
  ).map((c) => c.card.name);
  assert.equal(ranked.at(-1), "Tireless Tracker's Den");
});

test("selectCandidates: a land role lists real lands before spell // land cards", () => {
  const withFlip = [
    ...pool,
    card("Growing Rites of Itlimoc", {
      cmc: 3,
      typeLine: "Legendary Enchantment // Legendary Land",
      colorIdentity: ["G"],
    }),
  ];
  const ranked = selectCandidates(
    withFlip,
    query({ role: land, gapRoleIds: new Set() }),
    (role) => roleMatchSet(withFlip, role)
  ).map((c) => c.card.name);
  assert.deepEqual(ranked, ["Forest", "Growing Rites of Itlimoc"]);
});

test("selectCandidates: an open land gap doesn't promote spell // land cards for a spell role", () => {
  const withFlip = [
    ...pool,
    card("Bala Ged Recovery", {
      cmc: 3,
      typeLine: "Sorcery // Land",
      colorIdentity: ["G"],
      oracleText: "Return target card from your graveyard to your hand.",
    }),
  ];
  const ranked = selectCandidates(
    withFlip,
    query({ role: draw, gapRoleIds: new Set(["land"]) }),
    (role) => roleMatchSet(withFlip, role)
  );
  const bala = ranked.find((c) => c.card.name === "Bala Ged Recovery");
  assert.deepEqual(bala?.alsoFills, ["land"]);
  assert.notEqual(ranked[0].card.name, "Bala Ged Recovery");
});
