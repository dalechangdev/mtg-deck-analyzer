import "dotenv/config";
import { Readable } from "stream";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chain } = require("stream-chain");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parser } = require("stream-json/parser.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { streamArray } = require("stream-json/streamers/stream-array.js");
import { prisma } from "../src/lib/prisma";
import { fetchBulkDataUrl, canBeCommander, type ScryfallCard } from "../src/lib/scryfall";

const BATCH_SIZE = 100;

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
          data: [{
            id: card.id,
            setCode: card.set ?? "",
            setName: card.set_name ?? "",
            rarity: card.rarity ?? "",
            collectorNumber: card.collector_number ?? "",
            imageUris: card.image_uris as Record<string, string> | undefined,
            scryfallUri: card.scryfall_uri,
          }],
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

async function run() {
  console.log("Fetching Scryfall bulk data URL...");
  const url = await fetchBulkDataUrl();

  console.log("Streaming bulk data...");
  const res = await fetch(url, { headers: { "User-Agent": "mtg-deck-builder/1.0" } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  const cards = chain([nodeStream, parser(), streamArray()]);

  let batch: ScryfallCard[] = [];
  let upserted = 0;
  let skipped = 0;

  for await (const { value: card } of cards) {
    const legality = card.legalities?.commander;
    if (legality !== "legal" && legality !== "banned") {
      skipped++;
      continue;
    }
    if (!card.oracle_id || !card.name) {
      skipped++;
      continue;
    }
    batch.push(card);

    if (batch.length >= BATCH_SIZE) {
      await prisma.$transaction(batch.map(upsertCard), { timeout: 30000 });
      upserted += batch.length;
      batch = [];
      process.stdout.write(`\r${upserted} upserted, ${skipped} skipped`);
    }
  }

  if (batch.length > 0) {
    await prisma.$transaction(batch.map(upsertCard), { timeout: 30000 });
    upserted += batch.length;
  }

  console.log(`\nDone. ${upserted} cards upserted, ${skipped} skipped.`);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
