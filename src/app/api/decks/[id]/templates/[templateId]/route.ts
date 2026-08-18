import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; templateId: string }> };

/**
 * PUT — attach this template to the deck so the analysis page defaults to it.
 * Attaching replaces any previous attachment; a deck scores against one
 * template at a time in the UI, though the schema allows several.
 */
export async function PUT(_req: Request, { params }: Ctx) {
  const { id, templateId } = await params;

  const template = await prisma.analysisTemplate.findUnique({ where: { id: templateId } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.deckTemplate.deleteMany({ where: { deckId: id } }),
    prisma.deckTemplate.create({ data: { deckId: id, templateId } }),
  ]);

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, templateId } = await params;

  await prisma.deckTemplate.deleteMany({ where: { deckId: id, templateId } });

  return new NextResponse(null, { status: 204 });
}
