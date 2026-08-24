import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  readJsonBody,
  validateNewTemplate,
} from "@/lib/template-input";

export async function GET() {
  const templates = await prisma.analysisTemplate.findMany({
    orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
    include: {
      requirements: {
        orderBy: { sortOrder: "asc" },
        include: { role: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json(
    templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      format: t.format,
      deckSize: t.deckSize,
      isBuiltIn: t.isBuiltIn,
      requirements: t.requirements.map((r) => ({
        roleId: r.roleId,
        roleName: r.role.name,
        targetCount: r.targetCount,
        minCount: r.minCount,
        maxCount: r.maxCount,
        note: r.note,
      })),
    }))
  );
}

export async function POST(req: Request) {
  const body = await readJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  const parsed = await validateNewTemplate(body.value);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const { name, description, format, deckSize, requirements } = parsed.value;

  try {
    const template = await prisma.analysisTemplate.create({
      data: {
        name,
        description: description ?? null,
        ...(format !== undefined && { format }),
        ...(deckSize !== undefined && { deckSize }),
        // Requirements are stored in the order they arrive — the manager lists
        // them the way the user arranged them.
        requirements: {
          create: requirements.map((r, i) => ({ ...r, sortOrder: i })),
        },
      },
    });

    return NextResponse.json({ id: template.id }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error, "name")) {
      return NextResponse.json(
        { error: "A template with that name already exists" },
        { status: 409 }
      );
    }
    throw error;
  }
}
