import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { RequirementInput } from "@/app/api/templates/route";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;

  const template = await prisma.analysisTemplate.findUnique({
    where: { id },
    include: {
      requirements: {
        orderBy: { sortOrder: "asc" },
        include: { role: { select: { id: true, name: true, description: true } } },
      },
    },
  });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: template.id,
    name: template.name,
    description: template.description,
    format: template.format,
    deckSize: template.deckSize,
    isBuiltIn: template.isBuiltIn,
    requirements: template.requirements.map((r) => ({
      roleId: r.roleId,
      roleName: r.role.name,
      roleDescription: r.role.description,
      targetCount: r.targetCount,
      minCount: r.minCount,
      maxCount: r.maxCount,
      note: r.note,
    })),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();

  const template = await prisma.analysisTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (template.isBuiltIn) {
    return NextResponse.json(
      { error: "Built-in templates are read-only — duplicate it to make changes" },
      { status: 403 }
    );
  }

  const data: {
    name?: string;
    description?: string | null;
    format?: string;
    deckSize?: number;
  } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("description" in body) data.description = body.description ?? null;
  if (typeof body.format === "string") data.format = body.format;
  if (typeof body.deckSize === "number") data.deckSize = body.deckSize;

  const requirements: RequirementInput[] | null = Array.isArray(body.requirements)
    ? body.requirements
    : null;

  // Requirements are replaced wholesale — simpler than diffing, and the set is
  // small. Wrapped so a bad requirement can't leave the template with none.
  await prisma.$transaction(async (tx) => {
    await tx.analysisTemplate.update({ where: { id }, data });

    if (requirements) {
      await tx.templateRequirement.deleteMany({ where: { templateId: id } });
      await tx.templateRequirement.createMany({
        data: requirements.map((r, i) => ({
          templateId: id,
          roleId: r.roleId,
          targetCount: r.targetCount,
          minCount: r.minCount ?? null,
          maxCount: r.maxCount ?? null,
          note: r.note ?? null,
          sortOrder: i,
        })),
      });
    }
  });

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;

  const template = await prisma.analysisTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (template.isBuiltIn) {
    return NextResponse.json({ error: "Built-in templates cannot be deleted" }, { status: 403 });
  }

  // Requirements and DeckTemplate links cascade.
  await prisma.analysisTemplate.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
