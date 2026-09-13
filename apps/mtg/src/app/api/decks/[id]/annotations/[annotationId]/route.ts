import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDeckAccess } from "@/lib/ownership";

/**
 * Both handlers scope by deckId as well as annotationId. Without that, an
 * annotation id from any deck in the database could be edited by pairing it
 * with a deck the caller happens to own.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; annotationId: string }> }
) {
  const { id: deckId, annotationId } = await params;
  const access = await requireDeckAccess(deckId);
  if (access.response) return access.response;

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  const { count } = await prisma.cardAnnotation.updateMany({
    where: { id: annotationId, deckId },
    data: { content: content.trim() },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const annotation = await prisma.cardAnnotation.findFirst({
    where: { id: annotationId, deckId },
  });
  return NextResponse.json(annotation);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; annotationId: string }> }
) {
  const { id: deckId, annotationId } = await params;
  const access = await requireDeckAccess(deckId);
  if (access.response) return access.response;

  await prisma.cardAnnotation.deleteMany({ where: { id: annotationId, deckId } });
  return new NextResponse(null, { status: 204 });
}
