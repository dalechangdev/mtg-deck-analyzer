import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserIdOr401 } from "@/lib/auth";

export async function POST(req: Request) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { cardId } = await req.json();

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const entry = await prisma.shoppingCartCard.upsert({
    where: { userId_cardId: { userId: auth.userId, cardId } },
    create: { userId: auth.userId, cardId },
    update: {},
  });

  return NextResponse.json({ id: entry.id }, { status: 201 });
}
