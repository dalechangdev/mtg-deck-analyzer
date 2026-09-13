import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserIdOr401 } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; themeId: string }> };

/**
 * CardTheme links are GLOBAL reference data, not per-user: retagging a card
 * here changes what every account sees, and the classifiers in
 * deck-template.ts read those tags. Before this app was multi-user these
 * handlers had no auth at all, which on a public deployment means any
 * anonymous caller could retag the entire catalogue.
 *
 * Requiring a session is the floor, not the right answer -- any signed-up
 * account can still edit shared data for everybody. This needs either an admin
 * role or per-user theme overrides before the card browser is opened up
 * properly. Flagged rather than designed here because it is a product
 * decision, not a mechanical one.
 */


export async function PUT(_req: Request, { params }: Ctx) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

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
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { id, themeId } = await params;

  await prisma.card.update({
    where: { id },
    data: { themes: { disconnect: { id: themeId } } },
  });

  return new NextResponse(null, { status: 204 });
}
