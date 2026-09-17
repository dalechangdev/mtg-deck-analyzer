import DataLoader from "dataloader";
import { deckEntryOrderBy } from "@/lib/deck-entry";
import type { RlsClient } from "./rls";
import type {
  CardFaceModel,
  CardModel,
  CardPrintingModel,
  DeckCardModel,
  DeckModel,
  DeckVersionModel,
} from "@/generated/prisma/models";

/**
 * Per-request DataLoaders — the explicit answer to N+1.
 *
 * A graph invites the shape REST never had to serve: `decks { versions { cards
 * { card { printings } } } }`. Resolved naively that is one query per node, so
 * a 4-deck, 8-version, 400-card answer costs hundreds of round trips.
 *
 * Every loader here turns one tick's worth of individual `.load(id)` calls into
 * a single `WHERE … IN (…)`. That keeps the query count proportional to the
 * DEPTH of the query rather than to the number of rows it returns, which is the
 * property worth testing (and test/graphql-loaders.test.ts does).
 *
 * CONSTRUCTED PER REQUEST, NEVER PER PROCESS. Two reasons, and either alone
 * would be enough. A module-level loader would cache across requests and serve
 * one account's rows to the next — and these loaders read through an
 * RLS-scoped transaction that only exists for the length of one request.
 *
 * Note what is NOT in these queries: a userId filter. `libraryQuantityByCardId`
 * asks for library rows by card id and gets back only the viewer's, because the
 * "Own library" policy is doing the filtering. That is the whole point of
 * running as `authenticated` — see rls.ts.
 */

export type CardRow = CardModel;
export type PrintingRow = CardPrintingModel;
export type FaceRow = CardFaceModel;
export type DeckRow = DeckModel;
export type VersionRow = DeckVersionModel;
export type DeckCardRow = DeckCardModel;

/** Games with no recorded result count toward `games` but none of the three. */
export interface GameRecord {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export const EMPTY_RECORD: GameRecord = { games: 0, wins: 0, losses: 0, draws: 0 };

/**
 * Groups rows by a key, preserving the order the database returned them in, and
 * answers in the order the keys were requested — DataLoader requires the result
 * array to line up with the key array positionally.
 */
export function groupByKey<T, K extends string>(
  keys: readonly K[],
  rows: T[],
  keyOf: (row: T) => K
): T[][] {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return keys.map((key) => grouped.get(key) ?? []);
}

/** Same, for the at-most-one-row case. Missing ids answer null rather than throwing. */
export function indexByKey<T, K extends string>(
  keys: readonly K[],
  rows: T[],
  keyOf: (row: T) => K
): (T | null)[] {
  const byKey = new Map<K, T>();
  for (const row of rows) byKey.set(keyOf(row), row);
  return keys.map((key) => byKey.get(key) ?? null);
}

export interface Loaders {
  cardById: DataLoader<string, CardRow | null>;
  printingsByCardId: DataLoader<string, PrintingRow[]>;
  facesByCardId: DataLoader<string, FaceRow[]>;
  libraryQuantityByCardId: DataLoader<string, number>;
  deckById: DataLoader<string, DeckRow | null>;
  versionsByDeckId: DataLoader<string, VersionRow[]>;
  versionById: DataLoader<string, VersionRow | null>;
  cardsByVersionId: DataLoader<string, DeckCardRow[]>;
  mainCountByVersionId: DataLoader<string, number>;
  recordByVersionId: DataLoader<string, GameRecord>;
}

export function createLoaders(db: RlsClient): Loaders {
  return {
    cardById: new DataLoader(async (ids) => {
      const rows = await db.card.findMany({ where: { id: { in: [...ids] } } });
      return indexByKey(ids, rows, (row) => row.id);
    }),

    // Newest printing first — the same ordering card-detail.ts assumes when it
    // reads printings[0] for the image.
    printingsByCardId: new DataLoader(async (ids) => {
      const rows = await db.cardPrinting.findMany({
        where: { cardId: { in: [...ids] } },
        orderBy: { setCode: "desc" },
      });
      return groupByKey(ids, rows, (row) => row.cardId);
    }),

    facesByCardId: new DataLoader(async (ids) => {
      const rows = await db.cardFace.findMany({
        where: { cardId: { in: [...ids] } },
        orderBy: { faceIndex: "asc" },
      });
      return groupByKey(ids, rows, (row) => row.cardId);
    }),

    // No userId filter: RLS returns the viewer's rows and nobody else's.
    libraryQuantityByCardId: new DataLoader(async (ids) => {
      const rows = await db.libraryCard.findMany({
        where: { cardId: { in: [...ids] } },
        select: { cardId: true, quantity: true },
      });
      const byCard = new Map(rows.map((row) => [row.cardId, row.quantity]));
      return ids.map((id) => byCard.get(id) ?? 0);
    }),

    deckById: new DataLoader(async (ids) => {
      const rows = await db.deck.findMany({ where: { id: { in: [...ids] } } });
      return indexByKey(ids, rows, (row) => row.id);
    }),

    versionsByDeckId: new DataLoader(async (ids) => {
      const rows = await db.deckVersion.findMany({
        where: { deckId: { in: [...ids] } },
        orderBy: { createdAt: "asc" },
      });
      return groupByKey(ids, rows, (row) => row.deckId);
    }),

    versionById: new DataLoader(async (ids) => {
      const rows = await db.deckVersion.findMany({ where: { id: { in: [...ids] } } });
      return indexByKey(ids, rows, (row) => row.id);
    }),

    cardsByVersionId: new DataLoader(async (ids) => {
      const rows = await db.deckCard.findMany({
        where: { versionId: { in: [...ids] } },
        orderBy: deckEntryOrderBy,
      });
      return groupByKey(ids, rows, (row) => row.versionId);
    }),

    // Grouped aggregate rather than a count per version: one round trip however
    // many versions were asked for. Mirrors loadVersionSummaries().
    mainCountByVersionId: new DataLoader(async (ids) => {
      const sums = await db.deckCard.groupBy({
        by: ["versionId"],
        where: { versionId: { in: [...ids] }, slot: "main" },
        _sum: { quantity: true },
      });
      const byVersion = new Map(sums.map((row) => [row.versionId, row._sum.quantity ?? 0]));
      return ids.map((id) => byVersion.get(id) ?? 0);
    }),

    recordByVersionId: new DataLoader(async (ids) => {
      const counts = await db.gameLog.groupBy({
        by: ["versionId", "result"],
        where: { versionId: { in: [...ids] } },
        _count: { _all: true },
      });

      const byVersion = new Map<string, GameRecord>();
      for (const row of counts) {
        const record = byVersion.get(row.versionId) ?? { ...EMPTY_RECORD };
        const n = row._count._all;
        record.games += n;
        if (row.result === "WIN") record.wins += n;
        else if (row.result === "LOSS") record.losses += n;
        else if (row.result === "DRAW") record.draws += n;
        byVersion.set(row.versionId, record);
      }

      return ids.map((id) => byVersion.get(id) ?? { ...EMPTY_RECORD });
    }),
  };
}
