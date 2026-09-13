import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { parseCardQuery } from "@/lib/card-search";
import { buildCardWhere, buildCardOrderBy } from "@/lib/card-search-sql";

/**
 * Card search. Understands the full Advanced Search vocabulary in
 * `src/lib/card-search.ts`, plus the legacy `q` / `colors` params older
 * callers still send.
 *
 * Matching ids come back from one raw query — colour comparators and numeric
 * power/toughness filters need SQL Prisma can't generate — and only that page
 * of ids is hydrated through the client. The unpaged total rides along in
 * `X-Total-Count`; the body stays a plain array so existing callers are
 * unaffected.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = parseCardQuery(searchParams);
  const legacyColors = searchParams.get("colors")?.split(",").filter(Boolean) ?? [];
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20") || 20, 1), 100);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);

  const where = buildCardWhere(query, { legacyColors });
  const orderBy = buildCardOrderBy(query.sort, query.dir);

  const [matches, totals] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c.id FROM "Card" c
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `),
    prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS total FROM "Card" c WHERE ${where}
    `),
  ]);

  const userId = await getUserId();

  const ids = matches.map((row) => row.id);
  const cards = ids.length
    ? await prisma.card.findMany({
        where: { id: { in: ids } },
        include: {
          printings: { take: 1, orderBy: { setCode: "desc" } },
          faces: { take: 1, orderBy: { faceIndex: "asc" } },
          // Card browsing works signed out, so the "owned" badge is simply
          // absent then rather than the whole route 401ing.
          libraryEntries: userId ? { where: { userId }, take: 1 } : false,
        },
      })
    : [];

  // findMany ignores the id order, so restore the sort the SQL asked for.
  const byId = new Map(cards.map((card) => [card.id, card]));
  const results = ids.flatMap((id) => {
    const card = byId.get(id);
    if (!card) return [];
    const printing = card.printings[0];
    const imageUris = printing?.imageUris as Record<string, string> | null;
    const imageUrl = imageUris?.normal ?? imageUris?.small ?? card.faces[0]?.imageUri ?? null;
    return [
      {
        cardId: card.id,
        name: card.name,
        manaCost: card.manaCost,
        cmc: card.cmc,
        typeLine: card.typeLine,
        oracleText: card.oracleText,
        colorIdentity: card.colorIdentity,
        keywords: card.keywords,
        canBeCommander: card.canBeCommander,
        imageUrl,
        ownedQuantity: card.libraryEntries?.[0]?.quantity ?? 0,
      },
    ];
  });

  return NextResponse.json(results, {
    headers: { "X-Total-Count": String(totals[0]?.total ?? 0) },
  });
}
