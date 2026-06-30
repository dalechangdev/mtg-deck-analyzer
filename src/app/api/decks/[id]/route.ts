import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

function toEntry(dc: {
  id: string;
  isCommander: boolean;
  quantity: number;
  slot: string;
  card: {
    id: string;
    name: string;
    manaCost: string | null;
    cmc: number;
    typeLine: string;
    oracleText: string | null;
    colorIdentity: string[];
    keywords: string[];
    canBeCommander: boolean;
    printings: { imageUris: unknown }[];
    faces: { imageUri: string | null }[];
  };
}) {
  const printing = dc.card.printings[0];
  const imageUris = printing?.imageUris as Record<string, string> | null;
  const imageUrl = imageUris?.normal ?? imageUris?.small ?? dc.card.faces[0]?.imageUri ?? null;

  return {
    deckCardId: dc.id,
    isCommander: dc.isCommander,
    quantity: dc.quantity,
    slot: dc.slot as "main" | "maybe",
    cardId: dc.card.id,
    name: dc.card.name,
    manaCost: dc.card.manaCost,
    cmc: dc.card.cmc,
    typeLine: dc.card.typeLine,
    oracleText: dc.card.oracleText,
    colorIdentity: dc.card.colorIdentity,
    keywords: dc.card.keywords,
    canBeCommander: dc.card.canBeCommander,
    imageUrl,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = await prisma.deck.findUnique({
    where: { id },
    include: {
      themes: { select: { id: true } },
      cards: {
        include: {
          card: {
            include: {
              printings: { take: 1, orderBy: { setCode: "desc" } },
              faces: { take: 1, orderBy: { faceIndex: "asc" } },
            },
          },
        },
        orderBy: [{ isCommander: "desc" }, { card: { name: "asc" } }],
      },
    },
  });

  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: deck.id,
    name: deck.name,
    description: deck.description,
    themeIds: deck.themes.map((t) => t.id),
    maybeboardName: deck.maybeboardName,
    wishlistName: deck.wishlistName,
    entries: deck.cards.map(toEntry),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  await prisma.deck.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
