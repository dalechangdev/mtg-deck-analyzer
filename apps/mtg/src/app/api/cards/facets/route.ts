import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { CardFacets } from "@/lib/card-search";

/**
 * The option lists the Advanced Search modal offers: every set, type, subtype,
 * keyword and theme actually present in the local card pool. Derived rather
 * than hardcoded so a `sync-cards` run brings new sets and creature types
 * along with it.
 *
 * These only change when cards are re-synced, so one process-wide cache spares
 * the five aggregate scans on every modal open.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; data: CardFacets } | null = null;

/** Type lines read "Legendary Creature — Human Wizard": part 1 is the types. */
function typeWords(side: 1 | 2): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT unnest(
      string_to_array(btrim(split_part("typeLine", '—', ${side})), ' ')
    ) AS word
    FROM "Card"
  `;
}

async function loadFacets(): Promise<CardFacets> {
  const [sets, types, subtypes, keywords, themes] = await Promise.all([
    prisma.$queryRaw<{ code: string; name: string; count: bigint }[]>(Prisma.sql`
      SELECT DISTINCT ON (lower(p."setCode"))
        lower(p."setCode") AS code,
        p."setName" AS name,
        count(*) OVER (PARTITION BY lower(p."setCode")) AS count
      FROM "CardPrinting" p
      ORDER BY lower(p."setCode"), p."setName"
    `),
    prisma.$queryRaw<{ word: string }[]>(Prisma.sql`
      SELECT word FROM (${typeWords(1)}) w WHERE word <> '' AND word <> '//' ORDER BY word
    `),
    prisma.$queryRaw<{ word: string }[]>(Prisma.sql`
      SELECT word FROM (${typeWords(2)}) w WHERE word <> '' AND word <> '//' ORDER BY word
    `),
    prisma.$queryRaw<{ keyword: string }[]>(Prisma.sql`
      SELECT DISTINCT k AS keyword FROM "Card", unnest("keywords") k ORDER BY k
    `),
    prisma.cardTheme.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return {
    sets: sets
      .map((s) => ({ code: s.code, name: s.name, count: Number(s.count) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    types: types.map((t) => t.word),
    subtypes: subtypes.map((t) => t.word),
    keywords: keywords.map((k) => k.keyword),
    themes,
  };
}

export async function GET() {
  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    cache = { at: Date.now(), data: await loadFacets() };
  }
  return NextResponse.json(cache.data);
}
