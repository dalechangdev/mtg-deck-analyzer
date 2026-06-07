import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { cardId, quantity = 1 } = await req.json();

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const entry = await prisma.libraryCard.upsert({
    where: { cardId },
    create: { cardId, quantity: Math.max(1, quantity) },
    update: { quantity: { increment: 1 } },
  });

  return NextResponse.json({ id: entry.id, quantity: entry.quantity }, { status: 201 });
}
