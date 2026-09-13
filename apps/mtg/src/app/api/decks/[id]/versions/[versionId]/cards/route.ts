import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVersionAccess } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id: deckId, versionId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const { cardId, isCommander = false, slot = "main" } = await req.json();

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  // Enforce singleton for non-basic-lands
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const isBasic = card.typeLine.toLowerCase().includes("basic land");

  // Only one commander allowed — per version, since versions may differ.
  if (isCommander) {
    await prisma.deckCard.updateMany({
      where: { versionId, isCommander: true },
      data: { isCommander: false },
    });
  }

  let deckCard;
  if (isBasic) {
    deckCard = await prisma.deckCard.upsert({
      where: { versionId_cardId: { versionId, cardId } },
      create: { versionId, cardId, isCommander: false, quantity: 1, slot },
      update: { quantity: { increment: 1 } },
    });
  } else {
    const existing = await prisma.deckCard.findUnique({
      where: { versionId_cardId: { versionId, cardId } },
    });
    if (existing) return NextResponse.json({ error: "Card already in deck" }, { status: 409 });
    deckCard = await prisma.deckCard.create({
      data: { versionId, cardId, isCommander, quantity: 1, slot },
    });
  }

  return NextResponse.json({ id: deckCard.id }, { status: 201 });
}
