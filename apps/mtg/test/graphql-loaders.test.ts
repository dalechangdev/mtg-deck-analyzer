/**
 * The N+1 claim, measured rather than asserted.
 *
 * No database: the loaders take a Prisma client and only ever call findMany or
 * groupBy on it, so a stub that counts calls is enough to prove the property
 * that matters — that loading N ids costs one query, not N.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createLoaders, groupByKey, indexByKey, type GameRecord } from "@/lib/graphql/loaders";
import type { RlsClient } from "@/lib/graphql/rls";

type IdFilter = { where: { id: { in: string[] } } };
type CardIdFilter = { where: { cardId: { in: string[] } } };
type DeckIdFilter = { where: { deckId: { in: string[] } } };
type VersionIdFilter = { where: { versionId: { in: string[] } } };

/**
 * Records every call and the ids each one asked for, so a test can assert both
 * "one query" and "the ids were deduplicated into it".
 */
function stubDb() {
  const calls: { method: string; ids: string[] }[] = [];

  const record = (method: string, ids: string[]) => {
    calls.push({ method, ids: [...ids] });
    return ids;
  };

  const client = {
    card: {
      findMany: async ({ where }: IdFilter) =>
        record("card.findMany", where.id.in).map((id) => ({ id, name: `Card ${id}` })),
    },
    cardPrinting: {
      findMany: async ({ where }: CardIdFilter) =>
        record("cardPrinting.findMany", where.cardId.in).map((cardId) => ({
          cardId,
          setCode: "zzz",
        })),
    },
    cardFace: {
      findMany: async ({ where }: CardIdFilter) =>
        record("cardFace.findMany", where.cardId.in).map((cardId) => ({ cardId, faceIndex: 0 })),
    },
    libraryCard: {
      // Only "c1" is in the library — the others must come back 0, not undefined.
      findMany: async ({ where }: CardIdFilter) =>
        record("libraryCard.findMany", where.cardId.in)
          .filter((cardId) => cardId === "c1")
          .map((cardId) => ({ cardId, quantity: 3 })),
    },
    deck: {
      findMany: async ({ where }: IdFilter) =>
        record("deck.findMany", where.id.in).map((id) => ({ id, name: `Deck ${id}` })),
    },
    deckVersion: {
      findMany: async (args: Partial<IdFilter & DeckIdFilter>) => {
        if (args.where && "deckId" in args.where) {
          return record("deckVersion.findMany[byDeck]", args.where.deckId.in).map((deckId) => ({
            id: `${deckId}-v1`,
            deckId,
          }));
        }
        const ids = (args as IdFilter).where.id.in;
        return record("deckVersion.findMany[byId]", ids).map((id) => ({ id, deckId: "d1" }));
      },
    },
    deckCard: {
      findMany: async ({ where }: VersionIdFilter) =>
        record("deckCard.findMany", where.versionId.in).map((versionId) => ({
          id: `${versionId}-card`,
          versionId,
        })),
      groupBy: async ({ where }: VersionIdFilter) =>
        record("deckCard.groupBy", where.versionId.in).map((versionId) => ({
          versionId,
          _sum: { quantity: 99 },
        })),
    },
    gameLog: {
      groupBy: async ({ where }: VersionIdFilter) => {
        record("gameLog.groupBy", where.versionId.in);
        return [
          { versionId: "v1", result: "WIN", _count: { _all: 2 } },
          { versionId: "v1", result: "LOSS", _count: { _all: 1 } },
          { versionId: "v1", result: null, _count: { _all: 4 } },
          { versionId: "v2", result: "DRAW", _count: { _all: 1 } },
        ];
      },
    },
  };

  return { calls, client: client as unknown as RlsClient };
}

const countOf = (calls: { method: string }[], method: string) =>
  calls.filter((call) => call.method === method).length;

test("groupByKey answers in key order and gives absent keys an empty array", () => {
  const rows = [
    { key: "b", n: 1 },
    { key: "a", n: 2 },
    { key: "b", n: 3 },
  ];

  const grouped = groupByKey(["a", "b", "c"], rows, (row) => row.key);

  assert.deepEqual(grouped, [[{ key: "a", n: 2 }], [{ key: "b", n: 1 }, { key: "b", n: 3 }], []]);
});

test("groupByKey keeps the database's ordering inside each bucket", () => {
  const rows = [
    { key: "a", n: 3 },
    { key: "a", n: 1 },
    { key: "a", n: 2 },
  ];

  assert.deepEqual(
    groupByKey(["a"], rows, (row) => row.key)[0].map((row) => row.n),
    [3, 1, 2]
  );
});

test("indexByKey answers null for a missing row rather than throwing", () => {
  const rows = [{ id: "x", n: 1 }];

  assert.deepEqual(indexByKey(["x", "y"], rows, (row) => row.id), [{ id: "x", n: 1 }, null]);
});

test("loading many card ids costs one query, and repeats are deduplicated", async () => {
  const { calls, client } = stubDb();
  const loaders = createLoaders(client);

  const cards = await Promise.all([
    loaders.cardById.load("c1"),
    loaders.cardById.load("c2"),
    loaders.cardById.load("c3"),
    loaders.cardById.load("c1"),
  ]);

  assert.equal(countOf(calls, "card.findMany"), 1, "expected a single batched query");
  assert.deepEqual(calls[0].ids, ["c1", "c2", "c3"], "the repeated id should not be re-fetched");
  assert.deepEqual(
    cards.map((card) => card?.id),
    ["c1", "c2", "c3", "c1"]
  );
});

test("a deck / version / card traversal costs one query per level, not per row", async () => {
  const { calls, client } = stubDb();
  const loaders = createLoaders(client);

  // The shape a nested GraphQL query produces: three decks, each asking for its
  // versions, each version asking for its cards.
  const deckIds = ["d1", "d2", "d3"];
  const versionsPerDeck = await Promise.all(deckIds.map((id) => loaders.versionsByDeckId.load(id)));
  const versionIds = versionsPerDeck.flat().map((version) => version.id);
  await Promise.all(versionIds.map((id) => loaders.cardsByVersionId.load(id)));

  assert.equal(countOf(calls, "deckVersion.findMany[byDeck]"), 1);
  assert.equal(countOf(calls, "deckCard.findMany"), 1);
  assert.equal(calls.length, 2, "two levels of nesting should cost exactly two queries");
});

test("library quantity is 0 for a card the viewer does not own", async () => {
  const { calls, client } = stubDb();
  const loaders = createLoaders(client);

  const quantities = await Promise.all([
    loaders.libraryQuantityByCardId.load("c1"),
    loaders.libraryQuantityByCardId.load("c2"),
  ]);

  assert.deepEqual(quantities, [3, 0]);
  assert.equal(countOf(calls, "libraryCard.findMany"), 1);
});

test("game records split by result, and an unrecorded result still counts as a game", async () => {
  const { client } = stubDb();
  const loaders = createLoaders(client);

  const [v1, v2, v3] = await Promise.all([
    loaders.recordByVersionId.load("v1"),
    loaders.recordByVersionId.load("v2"),
    loaders.recordByVersionId.load("v3"),
  ]);

  // 2 wins + 1 loss + 4 with no recorded result = 7 games.
  assert.deepEqual(v1, { games: 7, wins: 2, losses: 1, draws: 0 } satisfies GameRecord);
  assert.deepEqual(v2, { games: 1, wins: 0, losses: 0, draws: 1 } satisfies GameRecord);
  assert.deepEqual(v3, { games: 0, wins: 0, losses: 0, draws: 0 } satisfies GameRecord);
});

test("an empty record is not shared between versions", async () => {
  const { client } = stubDb();
  const loaders = createLoaders(client);

  const [a, b] = await Promise.all([
    loaders.recordByVersionId.load("none-a"),
    loaders.recordByVersionId.load("none-b"),
  ]);

  a.wins += 1;
  assert.equal(b.wins, 0, "each version must get its own record object");
});
