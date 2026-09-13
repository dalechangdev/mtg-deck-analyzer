import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVersionAccess } from "@/lib/ownership";
import { readJsonBody } from "@/lib/template-input";
import { parseGameUpdate, toGameLogEntry } from "@/lib/game-log-input";

type Ctx = { params: Promise<{ id: string; versionId: string; gameId: string }> };

/**
 * Every query here is scoped by BOTH gameId and versionId. The gate establishes
 * that the caller owns the version in the URL; scoping by versionId is what ties
 * the game to it, so a gameId from somebody else's deck — or from another
 * version of your own — can't be edited by pairing it with a version you own.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id: deckId, versionId, gameId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const body = await readJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  const input = parseGameUpdate(body.value);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });

  const { count } = await prisma.gameLog.updateMany({
    where: { id: gameId, versionId },
    data: input.value,
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.gameLog.findFirst({ where: { id: gameId, versionId } });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(toGameLogEntry(updated));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id: deckId, versionId, gameId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const { count } = await prisma.gameLog.deleteMany({ where: { id: gameId, versionId } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
