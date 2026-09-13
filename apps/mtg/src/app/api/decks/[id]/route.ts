import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDeckAccess } from "@/lib/ownership";
import { resolveVersionId } from "@/lib/deck-version-loader";
import { deckEntryInclude, deckEntryOrderBy, toDeckEntry } from "@/lib/deck-entry";
import { Prisma } from "@/generated/prisma/client";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  const [deck, versionId] = await Promise.all([
    prisma.deck.findUnique({
      where: { id },
      include: { themes: { select: { id: true } } },
    }),
    resolveVersionId(id),
  ]);

  if (!deck || !versionId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Entries are the current version's.
  const cards = await prisma.deckCard.findMany({
    where: { versionId },
    include: deckEntryInclude,
    orderBy: deckEntryOrderBy,
  });

  return NextResponse.json({
    id: deck.id,
    name: deck.name,
    description: deck.description,
    themeIds: deck.themes.map((t) => t.id),
    maybeboardName: deck.maybeboardName,
    wishlistName: deck.wishlistName,
    versionId,
    entries: cards.map(toDeckEntry),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  const body = await req.json();

  const data: Prisma.DeckUpdateInput = {};

  if (body.name !== undefined) {
    if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    data.name = body.name.trim();
  }
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.themeIds !== undefined) {
    data.themes = { set: (body.themeIds as string[]).map((tid) => ({ id: tid })) };
  }
  if (body.maybeboardName !== undefined) data.maybeboardName = body.maybeboardName ?? null;
  if (body.wishlistName !== undefined) data.wishlistName = body.wishlistName ?? null;

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const deck = await prisma.deck.update({ where: { id }, data, include: { themes: true } });
  return NextResponse.json({
    id: deck.id,
    name: deck.name,
    description: deck.description,
    themeIds: deck.themes.map((t) => t.id),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireDeckAccess(id);
  if (access.response) return access.response;

  // Scoped by userId as well as id: the gate above already checked ownership,
  // but keeping it in the where clause means a future refactor that drops the
  // gate cannot turn this into "delete any deck by id".
  await prisma.deck.deleteMany({ where: { id, userId: access.userId } });
  return new NextResponse(null, { status: 204 });
}
