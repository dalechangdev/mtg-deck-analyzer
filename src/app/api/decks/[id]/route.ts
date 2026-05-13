import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toEntry(dc: {
  id: string;
  isCommander: boolean;
  card: {
    id: string;
    name: string;
    manaCost: string | null;
    typeLine: string;
    oracleText: string | null;
    colorIdentity: string[];
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
    cardId: dc.card.id,
    name: dc.card.name,
    manaCost: dc.card.manaCost,
    typeLine: dc.card.typeLine,
    oracleText: dc.card.oracleText,
    colorIdentity: dc.card.colorIdentity,
    canBeCommander: dc.card.canBeCommander,
    imageUrl,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = await prisma.deck.findUnique({
    where: { id },
    include: {
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
    entries: deck.cards.map(toEntry),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const deck = await prisma.deck.update({ where: { id }, data: { name: name.trim() } });
  return NextResponse.json({ id: deck.id, name: deck.name });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.deck.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
