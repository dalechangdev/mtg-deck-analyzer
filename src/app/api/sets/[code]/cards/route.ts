import { NextResponse } from "next/server";
import { searchSetCards } from "@/lib/scryfall";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));

  const { data, hasMore } = await searchSetCards(code, q, page);

  // One pickable entry per printing; image falls back to the front face for DFCs.
  const results = data.map((c) => {
    const imageUrl = c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null;
    return {
      scryfallId: c.id,
      oracleId: c.oracle_id,
      name: c.name,
      manaCost: c.mana_cost ?? null,
      typeLine: c.type_line,
      rarity: c.rarity,
      collectorNumber: c.collector_number,
      imageUrl,
    };
  });

  return NextResponse.json({ cards: results, hasMore });
}
