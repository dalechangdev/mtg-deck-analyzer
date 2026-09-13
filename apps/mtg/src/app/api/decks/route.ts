import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserIdOr401 } from "@/lib/auth";

export async function GET() {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const decks = await prisma.deck.findMany({
    where: { userId: auth.userId },
    orderBy: { updatedAt: "desc" },
    include: {
      // Commander and card count describe the version the deck opens on.
      currentVersion: {
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
      },
    },
  });

  return NextResponse.json(
    decks.map((deck) => {
      const commanderCard = deck.currentVersion?.cards[0]?.card;
      const printing = commanderCard?.printings[0];
      const imageUris = printing?.imageUris as Record<string, string> | null;
      const commanderImage =
        imageUris?.art_crop ?? imageUris?.normal ?? commanderCard?.faces[0]?.imageUri ?? null;

      return {
        id: deck.id,
        name: deck.name,
        cardCount: deck.currentVersion?._count.cards ?? 0,
        commanderName: commanderCard?.name ?? null,
        commanderImage,
        updatedAt: deck.updatedAt,
      };
    })
  );
}

export async function POST(req: Request) {
  const auth = await requireUserIdOr401();
  if (auth.response) return auth.response;

  const { name, commanderId } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  // Every deck starts with a v1 and opens on it. Two writes, because the deck
  // must exist before its version can, and currentVersionId must point at a
  // version that exists — one transaction so a deck is never left without one.
  const deck = await prisma.$transaction(async (tx) => {
    const created = await tx.deck.create({
      data: {
        userId: auth.userId,
        name: name.trim(),
        versions: {
          create: {
            name: "v1",
            ...(commanderId && {
              cards: {
                create: { cardId: commanderId, isCommander: true, quantity: 1 },
              },
            }),
          },
        },
      },
      include: { versions: { select: { id: true } } },
    });

    return tx.deck.update({
      where: { id: created.id },
      data: { currentVersionId: created.versions[0].id },
    });
  });

  return NextResponse.json({ id: deck.id }, { status: 201 });
}
