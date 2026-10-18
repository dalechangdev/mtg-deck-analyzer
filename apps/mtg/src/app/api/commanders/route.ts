import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserIdOr401 } from "@/lib/auth";
import { loadSavedCommanders } from "@/lib/saved-commanders";
import { parseNote } from "@/lib/saved-commander-input";

/** The caller's saved commanders. `?cardId=` narrows it to one card (the modal's saved state). */
export async function GET(req: Request) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const cardId = new URL(req.url).searchParams.get("cardId") ?? undefined;
  return NextResponse.json(await loadSavedCommanders(auth.userId, { cardId }));
}

/** Save a commander. Saving one that is already saved keeps it, and updates the note if one is sent. */
export async function POST(req: Request) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => null);
  const cardId = body?.cardId;
  if (typeof cardId !== "string" || !cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }
  const note = parseNote(body?.note);
  if (note === false) return NextResponse.json({ error: "Invalid note" }, { status: 400 });

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { canBeCommander: true, isCommanderLegal: true },
  });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  if (!card.canBeCommander || !card.isCommanderLegal) {
    return NextResponse.json({ error: "That card can't be a commander" }, { status: 400 });
  }

  const entry = await prisma.savedCommander.upsert({
    where: { userId_cardId: { userId: auth.userId, cardId } },
    create: { userId: auth.userId, cardId, note: note ?? null },
    update: note === undefined ? {} : { note },
  });

  return NextResponse.json({ id: entry.id, note: entry.note }, { status: 201 });
}
