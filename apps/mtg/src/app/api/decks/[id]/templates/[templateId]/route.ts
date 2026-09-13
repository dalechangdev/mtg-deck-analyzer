import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDeckAccess } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; templateId: string }> };

/**
 * PUT — attach this template to the deck so the analysis page defaults to it.
 * Attaching replaces any previous attachment; a deck scores against one
 * template at a time in the UI, though the schema allows several.
 */
export async function PUT(_req: Request, { params }: Ctx) {
  const { id, templateId } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  // Attachable templates are the caller's own plus the shared reference ones.
  const template = await prisma.analysisTemplate.findFirst({
    where: { id: templateId, OR: [{ ownerId: access.userId }, { ownerId: null }] },
  });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.deckTemplate.deleteMany({ where: { deckId: id } }),
    prisma.deckTemplate.create({ data: { deckId: id, templateId } }),
  ]);

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, templateId } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  await prisma.deckTemplate.deleteMany({ where: { deckId: id, templateId } });

  return new NextResponse(null, { status: 204 });
}
