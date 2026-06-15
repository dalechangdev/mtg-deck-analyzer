import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; annotationId: string }> }
) {
  const { annotationId } = await params;
  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  const annotation = await prisma.cardAnnotation.update({
    where: { id: annotationId },
    data: { content: content.trim() },
  });
  return NextResponse.json(annotation);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; annotationId: string }> }
) {
  const { annotationId } = await params;
  await prisma.cardAnnotation.delete({ where: { id: annotationId } });
  return new NextResponse(null, { status: 204 });
}
