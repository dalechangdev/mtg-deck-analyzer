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

/**
 * Set how many copies of a card this account owns, by cardId. Unlike POST
 * (which adds a copy) this is absolute and idempotent, so callers that only
 * know the card — the deck builder's notes dialog — can mark or unmark
 * ownership without first looking up the library row id. 0 removes the row.
 */
export async function PUT(req: Request) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { cardId, quantity } = await req.json();

  if (typeof cardId !== "string" || !cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return NextResponse.json({ error: "quantity (non-negative integer) required" }, { status: 400 });
  }

  if (quantity === 0) {
    await prisma.libraryCard.deleteMany({ where: { userId: auth.userId, cardId } });
    return NextResponse.json({ cardId, quantity: 0 });
  }

  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { id: true } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const entry = await prisma.libraryCard.upsert({
    where: { userId_cardId: { userId: auth.userId, cardId } },
    create: { userId: auth.userId, cardId, quantity },
    update: { quantity },
  });

  return NextResponse.json({ cardId, quantity: entry.quantity });
}
