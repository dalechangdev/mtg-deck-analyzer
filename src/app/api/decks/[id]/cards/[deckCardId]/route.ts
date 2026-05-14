import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; deckCardId: string }> }
) {
  const { deckCardId } = await params;
  const { slot } = await req.json();
  if (slot !== "main" && slot !== "maybe" && slot !== "wishlist") {
    return NextResponse.json({ error: "slot must be 'main', 'maybe', or 'wishlist'" }, { status: 400 });
  }
  const updated = await prisma.deckCard.update({
    where: { id: deckCardId },
    data: { slot },
  });
  return NextResponse.json({ id: updated.id, slot: updated.slot });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; deckCardId: string }> }
) {
  const { deckCardId } = await params;
  const updated = await prisma.deckCard.update({
    where: { id: deckCardId },
    data: { quantity: { decrement: 1 } },
  });
  if (updated.quantity <= 0) {
    await prisma.deckCard.delete({ where: { id: deckCardId } });
  }
  return new NextResponse(null, { status: 204 });
}
