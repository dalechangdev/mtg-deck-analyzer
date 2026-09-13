import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserIdOr401 } from "@/lib/auth";

/**
 * The row id alone is not a capability: every query is scoped by userId, so a
 * guessed library id belonging to another account matches nothing and answers
 * 404 rather than mutating their collection.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { id } = await params;
  const { quantity } = await req.json();

  if (typeof quantity !== "number") {
    return NextResponse.json({ error: "quantity (number) required" }, { status: 400 });
  }

  if (quantity <= 0) {
    const { count } = await prisma.libraryCard.deleteMany({
      where: { id, userId: auth.userId },
    });
    if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  }

  const { count } = await prisma.libraryCard.updateMany({
    where: { id, userId: auth.userId },
    data: { quantity },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ id, quantity });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { id } = await params;
  await prisma.libraryCard.deleteMany({ where: { id, userId: auth.userId } });
  return new NextResponse(null, { status: 204 });
}
