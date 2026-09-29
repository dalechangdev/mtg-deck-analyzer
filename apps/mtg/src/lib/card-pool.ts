import "server-only";

import { prisma } from "@/lib/prisma";
import type { ClassifiableCard, Role } from "@/lib/deck-template";
import { roleMatchSet } from "@/lib/template-candidates";

/**
 * Every commander-legal card, trimmed to what role matching reads, held in
 * process memory for the template builder's candidate lists.
 *
 * Role matchers are JS classifiers over `classifierText`, so they can't run in
 * Postgres without forking the rules the analysis page scores by. ~32k rows of
 * text is a few MB; one load serves every deck. Images are left out — the route
 * hydrates only the page it returns.
 *
 * Contains no user data, so sharing it across accounts is safe. Deck overrides
 * are applied per request in selectCandidates, never stored here.
 */

const TTL_MS = 60 * 60 * 1000; // a card sync is the only thing that changes it

type Pool = {
  cards: ClassifiableCard[];
  loadedAt: number;
  /** Role match sets, keyed by the matcher list so an edited role isn't served stale. */
  matchSets: Map<string, Set<string>>;
};

// On globalThis for the same reason as the Prisma client: dev hot reload would
// otherwise reload 32k rows on every edit.
const globalForPool = globalThis as unknown as { cardPool?: Promise<Pool> };

type PoolRow = {
  id: string;
  name: string;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  oracleText: string | null;
  colorIdentity: string[];
  keywords: string[];
  canBeCommander: boolean;
  faces: { typeLine: string; oracleText: string | null }[];
  themeIds: string[];
};

async function loadPool(): Promise<Pool> {
  // Prisma's implicit m2m join table for Card.themes: A = Card.id, B = CardTheme.id.
  const rows = await prisma.$queryRaw<PoolRow[]>`
    SELECT c.id, c.name, c."manaCost", c.cmc, c."typeLine", c."oracleText",
           c."colorIdentity", c.keywords, c."canBeCommander",
           coalesce((
             SELECT json_agg(json_build_object('typeLine', f."typeLine", 'oracleText', f."oracleText")
                             ORDER BY f."faceIndex")
             FROM "CardFace" f WHERE f."cardId" = c.id
           ), '[]'::json) AS faces,
           coalesce((
             SELECT array_agg(t."B") FROM "_CardToCardTheme" t WHERE t."A" = c.id
           ), '{}'::text[]) AS "themeIds"
    FROM "Card" c
    WHERE c."isCommanderLegal" = true
  `;

  return {
    loadedAt: Date.now(),
    matchSets: new Map(),
    cards: rows.map((row) => ({
      cardId: row.id,
      name: row.name,
      manaCost: row.manaCost,
      cmc: row.cmc,
      typeLine: row.typeLine,
      oracleText: row.oracleText,
      colorIdentity: row.colorIdentity,
      keywords: row.keywords,
      canBeCommander: row.canBeCommander,
      imageUrl: null,
      faces: row.faces,
      themeIds: row.themeIds,
    })),
  };
}

async function getPool(): Promise<Pool> {
  const cached = globalForPool.cardPool;
  if (cached) {
    const pool = await cached.catch(() => null);
    if (pool && Date.now() - pool.loadedAt < TTL_MS) return pool;
  }

  // Store the promise, not the result, so concurrent first requests share one load.
  const loading = loadPool();
  globalForPool.cardPool = loading;
  loading.catch(() => {
    if (globalForPool.cardPool === loading) globalForPool.cardPool = undefined;
  });
  return loading;
}

export type CardPool = {
  cards: ClassifiableCard[];
  /** Ids of pool cards that fill the role, ignoring deck overrides. Memoised. */
  matchSetFor: (role: Role) => Set<string>;
};

export async function getCardPool(): Promise<CardPool> {
  const pool = await getPool();
  return {
    cards: pool.cards,
    matchSetFor(role) {
      const key = JSON.stringify(role.matchers);
      let set = pool.matchSets.get(key);
      if (!set) {
        set = roleMatchSet(pool.cards, role);
        pool.matchSets.set(key, set);
      }
      return set;
    },
  };
}
