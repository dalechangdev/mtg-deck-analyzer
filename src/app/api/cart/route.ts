import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { cardId } = await req.json();

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const entry = await prisma.shoppingCartCard.upsert({
    where: { cardId },
    create: { cardId },
    update: {},
  });

  return NextResponse.json({ id: entry.id }, { status: 201 });
}
