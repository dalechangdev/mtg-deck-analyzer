import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDeckAccess } from "@/lib/ownership";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params;
  const access = await requireDeckAccess(deckId);
  if (access.response) return access.response;

  const { searchParams } = new URL(req.url);
  const cardId = searchParams.get("cardId");
  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  const annotations = await prisma.cardAnnotation.findMany({
    where: { deckId, cardId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(annotations);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = await params;
  const access = await requireDeckAccess(deckId);
  if (access.response) return access.response;

  const { cardId, content } = await req.json();
  if (!cardId || !content?.trim()) {
    return NextResponse.json({ error: "cardId and content required" }, { status: 400 });
  }

  const annotation = await prisma.cardAnnotation.create({
    data: { deckId, cardId, content: content.trim() },
  });
  return NextResponse.json(annotation, { status: 201 });
}
