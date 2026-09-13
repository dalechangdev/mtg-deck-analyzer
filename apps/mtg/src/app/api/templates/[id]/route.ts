import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTemplateAccess } from "@/lib/ownership";
import {
  isUniqueViolation,
  readJsonBody,
  validateTemplateUpdate,
} from "@/lib/template-input";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireTemplateAccess(id, "read");
  if (access.response) return access.response;

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
  // "write" resolves shared reference templates (ownerId null) to 404, which
  // is the same answer built-ins gave before multi-tenancy.
  const access = await requireTemplateAccess(id, "write");
  if (access.response) return access.response;

  const template = await prisma.analysisTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (template.isBuiltIn) {
    return NextResponse.json(
      { error: "Built-in templates are read-only — duplicate it to make changes" },
      { status: 403 }
    );
  }

  const body = await readJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  const parsed = await validateTemplateUpdate(body.value, access.userId, id);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  // Only the keys the request actually supplied are present, so an update that
  // touches one field leaves the rest of the row alone.
  const { requirements, ...data } = parsed.value;

  try {
    // Requirements are replaced wholesale — simpler than diffing, and the set is
    // small. Wrapped so a bad requirement can't leave the template with none.
    await prisma.$transaction(async (tx) => {
      await tx.analysisTemplate.update({ where: { id }, data });

      if (requirements) {
        await tx.templateRequirement.deleteMany({ where: { templateId: id } });
        await tx.templateRequirement.createMany({
          data: requirements.map((r, i) => ({ ...r, templateId: id, sortOrder: i })),
        });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error, "name")) {
      return NextResponse.json(
        { error: "A template with that name already exists" },
        { status: 409 }
      );
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireTemplateAccess(id, "write");
  if (access.response) return access.response;

  const template = await prisma.analysisTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (template.isBuiltIn) {
    return NextResponse.json({ error: "Built-in templates cannot be deleted" }, { status: 403 });
  }

  // Requirements and DeckTemplate links cascade.
  await prisma.analysisTemplate.deleteMany({ where: { id, ownerId: access.userId } });

  return new NextResponse(null, { status: 204 });
}
