import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; themeId: string }> };

export async function PUT(_req: Request, { params }: Ctx) {
  const { id, themeId } = await params;

  const theme = await prisma.cardTheme.findUnique({ where: { id: themeId } });
  if (!theme) return NextResponse.json({ error: "Theme not found" }, { status: 404 });

  await prisma.card.update({
    where: { id },
    data: { themes: { connect: { id: themeId } } },
  });

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, themeId } = await params;

  await prisma.card.update({
    where: { id },
    data: { themes: { disconnect: { id: themeId } } },
  });

  return new NextResponse(null, { status: 204 });
}
