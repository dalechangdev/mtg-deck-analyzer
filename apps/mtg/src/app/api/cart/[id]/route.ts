import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserIdOr401 } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { id } = await params;
  await prisma.shoppingCartCard.deleteMany({ where: { id, userId: auth.userId } });
  return new NextResponse(null, { status: 204 });
}
