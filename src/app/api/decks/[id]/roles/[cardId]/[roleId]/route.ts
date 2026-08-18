import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; cardId: string; roleId: string }> };

/**
 * PUT  — pin this card into (or out of) the role for this deck.
 *        Body: { assignment: "INCLUDED" | "EXCLUDED" }, defaults to INCLUDED.
 * DELETE — drop the override and fall back to automatic classification.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id, cardId, roleId } = await params;

  let assignment: "INCLUDED" | "EXCLUDED" = "INCLUDED";
  try {
    const body = await req.json();
    if (body?.assignment === "EXCLUDED") assignment = "EXCLUDED";
  } catch {
    // No body — keep the INCLUDED default.
  }

  const role = await prisma.cardRole.findUnique({ where: { id: roleId } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  await prisma.deckCardRole.upsert({
    where: { deckId_cardId_roleId: { deckId: id, cardId, roleId } },
    create: { deckId: id, cardId, roleId, assignment },
    update: { assignment },
  });

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, cardId, roleId } = await params;

  await prisma.deckCardRole.deleteMany({
    where: { deckId: id, cardId, roleId },
  });

  return new NextResponse(null, { status: 204 });
}
