import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVersionAccess } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; versionId: string; deckCardId: string }> };

/**
 * Every query here is scoped by BOTH deckCardId and versionId. The gate
 * establishes that the caller owns the version in the URL; scoping by versionId
 * is what ties the row to that version, so a deckCardId belonging to somebody
 * else's deck — or to another version of your own — cannot be edited by pairing
 * it with a version you do own.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id: deckId, versionId, deckCardId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const { slot, isCommander } = await req.json();

  if (slot !== undefined && slot !== "main" && slot !== "maybe" && slot !== "wishlist") {
    return NextResponse.json({ error: "slot must be 'main', 'maybe', or 'wishlist'" }, { status: 400 });
  }
  if (slot === undefined && isCommander === undefined) {
    return NextResponse.json({ error: "slot or isCommander required" }, { status: 400 });
  }

  // Promoting a card already in the deck to commander: only one is allowed, and
  // the commander always sits in the main slot.
  if (isCommander === true) {
    await prisma.deckCard.updateMany({
      where: { versionId, isCommander: true },
      data: { isCommander: false },
    });
  }

  const { count } = await prisma.deckCard.updateMany({
    where: { id: deckCardId, versionId },
    data: {
      ...(slot !== undefined && { slot }),
      ...(isCommander !== undefined && { isCommander }),
      ...(isCommander === true && { slot: "main" }),
    },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.deckCard.findFirst({ where: { id: deckCardId, versionId } });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: updated.id,
    slot: updated.slot,
    isCommander: updated.isCommander,
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id: deckId, versionId, deckCardId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const existing = await prisma.deckCard.findFirst({
    where: { id: deckCardId, versionId },
    select: { id: true, quantity: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.quantity <= 1) {
    await prisma.deckCard.delete({ where: { id: existing.id } });
  } else {
    await prisma.deckCard.update({
      where: { id: existing.id },
      data: { quantity: { decrement: 1 } },
    });
  }

  return new NextResponse(null, { status: 204 });
}
