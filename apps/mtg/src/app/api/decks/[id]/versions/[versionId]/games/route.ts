import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVersionAccess } from "@/lib/ownership";
import { readJsonBody } from "@/lib/template-input";
import { gameLogOrderBy, parseNewGame, toGameLogEntry } from "@/lib/game-log-input";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

/** GET — the version's game log, newest first. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id: deckId, versionId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const games = await prisma.gameLog.findMany({
    where: { versionId },
    orderBy: gameLogOrderBy,
  });
  return NextResponse.json({ games: games.map(toGameLogEntry) });
}

/** POST { notes, playedAt?, result?, podSize?, opponents?, turns? } — log a game played with this version. */
export async function POST(req: Request, { params }: Ctx) {
  const { id: deckId, versionId } = await params;
  const access = await requireVersionAccess(deckId, versionId);
  if (access.response) return access.response;

  const body = await readJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  const input = parseNewGame(body.value);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });

  const game = await prisma.gameLog.create({ data: { ...input.value, versionId } });
  return NextResponse.json(toGameLogEntry(game), { status: 201 });
}
