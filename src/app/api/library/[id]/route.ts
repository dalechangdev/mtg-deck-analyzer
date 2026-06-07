import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { quantity } = await req.json();

  if (typeof quantity !== "number") {
    return NextResponse.json({ error: "quantity (number) required" }, { status: 400 });
  }

  if (quantity <= 0) {
    await prisma.libraryCard.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  }

  const updated = await prisma.libraryCard.update({
    where: { id },
    data: { quantity },
  });
  return NextResponse.json({ id: updated.id, quantity: updated.quantity });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.libraryCard.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
