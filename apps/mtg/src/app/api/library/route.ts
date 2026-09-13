import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserIdOr401 } from "@/lib/auth";

export async function POST(req: Request) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { cardId, quantity = 1 } = await req.json();

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  // Uniqueness is (userId, cardId) now — one library row per card per account.
  const entry = await prisma.libraryCard.upsert({
    where: { userId_cardId: { userId: auth.userId, cardId } },
    create: { userId: auth.userId, cardId, quantity: Math.max(1, quantity) },
    update: { quantity: { increment: 1 } },
  });

  return NextResponse.json({ id: entry.id, quantity: entry.quantity }, { status: 201 });
}
