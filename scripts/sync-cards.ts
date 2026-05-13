import { prisma } from "../src/lib/prisma";
import { fetchBulkDataUrl, canBeCommander, type ScryfallCard } from "../src/lib/scryfall";

const BATCH_SIZE = 500;

async function run() {
  console.log("Fetching Scryfall bulk data URL...");
  const url = await fetchBulkDataUrl();

  console.log("Downloading bulk data...");
  const res = await fetch(url, { headers: { "User-Agent": "mtg-deck-builder/1.0" } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const cards: ScryfallCard[] = await res.json();
  console.log(`Downloaded ${cards.length} cards. Syncing to database...`);

  // Filter to Commander-legal cards only
  const commanderLegal = cards.filter((c) => c.legalities.commander === "legal" || c.legalities.commander === "banned");

  let upserted = 0;
  for (let i = 0; i < commanderLegal.length; i += BATCH_SIZE) {
    const batch = commanderLegal.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map((card) =>
        prisma.card.upsert({
          where: { id: card.oracle_id },
          update: {
            name: card.name,
            manaCost: card.mana_cost ?? null,
            cmc: card.cmc,
            typeLine: card.type_line,
            oracleText: card.oracle_text ?? null,
            colors: card.colors ?? [],
            colorIdentity: card.color_identity,
            keywords: card.keywords,
            power: card.power ?? null,
            toughness: card.toughness ?? null,
            loyalty: card.loyalty ?? null,
            isCommanderLegal: card.legalities.commander === "legal",
            canBeCommander: canBeCommander(card),
          },
          create: {
            id: card.oracle_id,
            name: card.name,
            manaCost: card.mana_cost ?? null,
            cmc: card.cmc,
            typeLine: card.type_line,
            oracleText: card.oracle_text ?? null,
            colors: card.colors ?? [],
            colorIdentity: card.color_identity,
            keywords: card.keywords,
            power: card.power ?? null,
            toughness: card.toughness ?? null,
            loyalty: card.loyalty ?? null,
            isCommanderLegal: card.legalities.commander === "legal",
            canBeCommander: canBeCommander(card),
            printings: {
              create: {
                id: card.id,
                setCode: card.set,
                setName: card.set_name,
                rarity: card.rarity,
                collectorNumber: card.collector_number,
                imageUris: card.image_uris as Record<string, string> | undefined,
                scryfallUri: card.scryfall_uri,
              },
            },
            faces: card.card_faces
              ? {
                  create: card.card_faces.map((face, idx) => ({
                    faceIndex: idx,
                    name: face.name,
                    manaCost: face.mana_cost ?? null,
                    typeLine: face.type_line,
                    oracleText: face.oracle_text ?? null,
                    power: face.power ?? null,
                    toughness: face.toughness ?? null,
                    loyalty: face.loyalty ?? null,
                    imageUri: face.image_uris?.normal ?? null,
                  })),
                }
              : undefined,
          },
        })
      )
    );

    upserted += batch.length;
    process.stdout.write(`\r${upserted} / ${commanderLegal.length}`);
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
