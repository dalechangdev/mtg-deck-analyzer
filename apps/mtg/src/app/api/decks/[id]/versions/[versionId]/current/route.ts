import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVersionAccess } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

/** PUT — make this the version the deck opens on. */
export async function PUT(_req: Request, { params }: Ctx) {
  const { id: deckId, versionId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  // Scoped by userId as well as id, like DELETE /api/decks/[id]: the gate
  // already checked, but the write shouldn't depend on it staying in place.
  await prisma.deck.updateMany({
    where: { id: deckId, userId: access.userId },
    data: { currentVersionId: versionId },
  });

  return new NextResponse(null, { status: 204 });
}
