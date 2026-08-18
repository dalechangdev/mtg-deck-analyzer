import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type RequirementInput = {
  roleId: string;
  targetCount: number;
  minCount?: number | null;
  maxCount?: number | null;
  note?: string | null;
};

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
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const requirements: RequirementInput[] = Array.isArray(body.requirements)
    ? body.requirements
    : [];
  if (requirements.length === 0) {
    return NextResponse.json({ error: "At least one requirement is required" }, { status: 400 });
  }

  // Roles must exist — a requirement pointing at a missing role would fail the
  // FK with an opaque error.
  const roles = await prisma.cardRole.findMany({
    where: { id: { in: requirements.map((r) => r.roleId) } },
    select: { id: true },
  });
  const known = new Set(roles.map((r) => r.id));
  const unknown = requirements.filter((r) => !known.has(r.roleId)).map((r) => r.roleId);
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown roles: ${unknown.join(", ")}` }, { status: 400 });
  }

  const existing = await prisma.analysisTemplate.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "A template with that name already exists" }, { status: 409 });
  }

  const template = await prisma.analysisTemplate.create({
    data: {
      name,
      description: typeof body.description === "string" ? body.description : null,
      format: typeof body.format === "string" ? body.format : "commander",
      deckSize: typeof body.deckSize === "number" ? body.deckSize : 100,
      requirements: {
        create: requirements.map((r, i) => ({
          roleId: r.roleId,
          targetCount: r.targetCount,
          minCount: r.minCount ?? null,
          maxCount: r.maxCount ?? null,
          note: r.note ?? null,
          sortOrder: i,
        })),
      },
    },
  });

  return NextResponse.json({ id: template.id }, { status: 201 });
}
