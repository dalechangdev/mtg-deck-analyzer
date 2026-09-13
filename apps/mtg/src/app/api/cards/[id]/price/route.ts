import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { itaca } from "@/lib/itaca-client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: { printings: { take: 1, orderBy: { setCode: "desc" } } },
  });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const setName = card.printings[0]?.setName;
  if (!setName) return NextResponse.json({ error: "No printing on file for this card" }, { status: 404 });

  const pricing = await itaca.getPricing(card.name, setName);
  if (!pricing) return NextResponse.json({ error: "Not found on itaca.gg" }, { status: 404 });

  return NextResponse.json(pricing);
}
