import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params;
  const { cardId, isCommander = false } = await req.json();

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  // Enforce singleton for non-basic-lands
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const isBasic = card.typeLine.toLowerCase().includes("basic land");
  if (!isBasic) {
    const existing = await prisma.deckCard.findUnique({
      where: { deckId_cardId: { deckId, cardId } },
    });
    if (existing) return NextResponse.json({ error: "Card already in deck" }, { status: 409 });
  }

  // Only one commander allowed
  if (isCommander) {
    await prisma.deckCard.updateMany({
      where: { deckId, isCommander: true },
      data: { isCommander: false },
    });
  }

  const deckCard = await prisma.deckCard.create({
    data: { deckId, cardId, isCommander, quantity: 1 },
  });

  return NextResponse.json({ id: deckCard.id }, { status: 201 });
}
