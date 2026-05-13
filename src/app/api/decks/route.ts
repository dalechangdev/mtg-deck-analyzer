import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const decks = await prisma.deck.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      cards: {
        where: { isCommander: true },
        include: {
          card: {
            include: {
              printings: { take: 1, orderBy: { setCode: "desc" } },
              faces: { take: 1, orderBy: { faceIndex: "asc" } },
            },
          },
        },
        take: 1,
      },
      _count: { select: { cards: true } },
    },
  });

  return NextResponse.json(
    decks.map((deck) => {
      const commanderCard = deck.cards[0]?.card;
      const printing = commanderCard?.printings[0];
      const imageUris = printing?.imageUris as Record<string, string> | null;
      const commanderImage =
        imageUris?.art_crop ?? imageUris?.normal ?? commanderCard?.faces[0]?.imageUri ?? null;

      return {
        id: deck.id,
        name: deck.name,
        cardCount: deck._count.cards,
        commanderName: commanderCard?.name ?? null,
        commanderImage,
        updatedAt: deck.updatedAt,
      };
    })
  );
}

export async function POST(req: Request) {
  const { name, commanderId } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const deck = await prisma.deck.create({
    data: {
      name: name.trim(),
      ...(commanderId && {
        cards: {
          create: { cardId: commanderId, isCommander: true, quantity: 1 },
        },
      }),
    },
  });

  return NextResponse.json({ id: deck.id }, { status: 201 });
}
