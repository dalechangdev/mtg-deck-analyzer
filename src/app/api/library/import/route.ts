import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canBeCommander, fetchCollection, type ScryfallCard } from "@/lib/scryfall";

// Mirrors scripts/sync-cards.ts upsertCard: keep one Card row per oracle identity,
// enriching its printings/faces without clobbering on repeat opens.
function upsertCard(card: ScryfallCard) {
  const base = {
    name: card.name ?? "",
    manaCost: card.mana_cost ?? null,
    cmc: card.cmc ?? 0,
    typeLine: card.type_line ?? "",
    oracleText: card.oracle_text ?? null,
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    keywords: card.keywords ?? [],
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    loyalty: card.loyalty ?? null,
    isCommanderLegal: card.legalities?.commander === "legal",
    canBeCommander: canBeCommander(card),
  };

  return prisma.card.upsert({
    where: { id: card.oracle_id },
    update: base,
    create: {
      id: card.oracle_id,
      ...base,
      printings: {
        createMany: {
          skipDuplicates: true,
          data: [
            {
              id: card.id,
              setCode: card.set ?? "",
              setName: card.set_name ?? "",
              rarity: card.rarity ?? "",
              collectorNumber: card.collector_number ?? "",
              imageUris: card.image_uris as Record<string, string> | undefined,
              scryfallUri: card.scryfall_uri,
            },
          ],
        },
      },
      faces: card.card_faces
        ? {
            createMany: {
              skipDuplicates: true,
              data: card.card_faces.map((face, idx) => ({
                faceIndex: idx,
                name: face.name ?? "",
                manaCost: face.mana_cost ?? null,
                typeLine: face.type_line ?? "",
                oracleText: face.oracle_text ?? null,
                power: face.power ?? null,
                toughness: face.toughness ?? null,
                loyalty: face.loyalty ?? null,
                imageUri: face.image_uris?.normal ?? null,
              })),
            },
          }
        : undefined,
    },
  });
}

type ImportItem = { scryfallId: string; quantity: number };

export async function POST(req: Request) {
  const { items } = (await req.json()) as { items?: ImportItem[] };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items (non-empty array) required" }, { status: 400 });
  }

  // Collapse duplicate scryfallIds and ignore non-positive quantities.
  const qtyById = new Map<string, number>();
  for (const it of items) {
    if (!it?.scryfallId) continue;
    const qty = Math.max(0, Math.floor(it.quantity ?? 0));
    if (qty <= 0) continue;
    qtyById.set(it.scryfallId, (qtyById.get(it.scryfallId) ?? 0) + qty);
  }

  if (qtyById.size === 0) {
    return NextResponse.json({ error: "no valid items" }, { status: 400 });
  }

  // Fetch authoritative card data so we write the same shape as the sync script.
  const cards = await fetchCollection([...qtyById.keys()]);
  const byScryfallId = new Map(cards.map((c) => [c.id, c]));

  let addedCopies = 0;
  let addedDistinct = 0;
  const notFound: string[] = [];

  for (const [scryfallId, quantity] of qtyById) {
    const card = byScryfallId.get(scryfallId);
    if (!card?.oracle_id) {
      notFound.push(scryfallId);
      continue;
    }

    await upsertCard(card);
    await prisma.libraryCard.upsert({
      where: { cardId: card.oracle_id },
      create: { cardId: card.oracle_id, quantity },
      update: { quantity: { increment: quantity } },
    });

    addedCopies += quantity;
    addedDistinct += 1;
  }

  return NextResponse.json({ addedCopies, addedDistinct, notFound }, { status: 201 });
}
