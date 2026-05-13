import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const colors = searchParams.get("colors")?.split(",").filter(Boolean) ?? [];
  const commanderOnly = searchParams.get("commander") === "1";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));

  const where = {
    isCommanderLegal: true,
    ...(q && { name: { contains: q, mode: "insensitive" as const } }),
    ...(colors.length > 0 && { colorIdentity: { hasSome: colors } }),
    ...(commanderOnly && { canBeCommander: true }),
  };

  const cards = await prisma.card.findMany({
    where,
    include: {
      printings: { take: 1, orderBy: { setCode: "desc" } },
      faces: { take: 1, orderBy: { faceIndex: "asc" } },
    },
    orderBy: { name: "asc" },
    take: limit,
    skip: (page - 1) * limit,
  });

  const results = cards.map((card) => {
    const printing = card.printings[0];
    const imageUris = printing?.imageUris as Record<string, string> | null;
    const imageUrl = imageUris?.normal ?? imageUris?.small ?? card.faces[0]?.imageUri ?? null;
    return {
      cardId: card.id,
      name: card.name,
      manaCost: card.manaCost,
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      colorIdentity: card.colorIdentity,
      canBeCommander: card.canBeCommander,
      imageUrl,
    };
  });

  return NextResponse.json(results);
}
