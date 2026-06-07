import { NextResponse } from "next/server";
import { fetchSets } from "@/lib/scryfall";

export async function GET() {
  const sets = await fetchSets();
  const results = sets.map((s) => ({
    code: s.code,
    name: s.name,
    cardCount: s.card_count,
    releasedAt: s.released_at ?? null,
    iconUri: s.icon_svg_uri ?? null,
  }));
  return NextResponse.json(results);
}
