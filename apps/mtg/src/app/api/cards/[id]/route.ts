import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cardDetailInclude, toCardDetail } from "@/lib/card-detail";

type Ctx = { params: Promise<{ id: string }> };

/**
 * One card in the shape `CardDetailModal` wants. Pages that render the modal
 * server-side get this from `toCardDetail` directly; the search panel needs it
 * on demand, because its results carry only the summary fields.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: cardDetailInclude,
  });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  return NextResponse.json(toCardDetail(card));
}
