import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; deckCardId: string }> }
) {
  const { deckCardId } = await params;
  await prisma.deckCard.delete({ where: { id: deckCardId } });
  return new NextResponse(null, { status: 204 });
}
