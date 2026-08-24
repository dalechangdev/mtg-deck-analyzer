import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  nameIsTaken,
  nextCopyName,
  readOptionalJsonBody,
  validateName,
} from "@/lib/template-input";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/templates/[id]/duplicate
 *
 * Copy a template, requirements and all. Built-ins are the point — they're
 * read-only, so duplicating is how you get an editable version — and the copy
 * is never itself built-in.
 *
 * Body is optional: `{ "name": "…" }` names the copy, otherwise it takes the
 * first free name in the `X (copy)`, `X (copy 2)` sequence.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  const source = await prisma.analysisTemplate.findUnique({
    where: { id },
    include: { requirements: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await readOptionalJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  let name: string;
  if ("name" in body.value) {
    const requested = validateName(body.value.name);
    if (!requested.ok) {
      return NextResponse.json({ error: requested.error }, { status: requested.status });
    }
    if (await nameIsTaken(requested.value)) {
      return NextResponse.json(
        { error: "A template with that name already exists" },
        { status: 409 }
      );
    }
    name = requested.value;
  } else {
    const existing = await prisma.analysisTemplate.findMany({ select: { name: true } });
    name = nextCopyName(source.name, existing.map((t) => t.name));
  }

  try {
    const copy = await prisma.analysisTemplate.create({
      data: {
        name,
        description: source.description,
        format: source.format,
        deckSize: source.deckSize,
        // isBuiltIn stays false — a copy exists to be edited.
        requirements: {
          create: source.requirements.map((r) => ({
            roleId: r.roleId,
            targetCount: r.targetCount,
            minCount: r.minCount,
            maxCount: r.maxCount,
            note: r.note,
            sortOrder: r.sortOrder,
          })),
        },
      },
    });

    return NextResponse.json({ id: copy.id }, { status: 201 });
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
