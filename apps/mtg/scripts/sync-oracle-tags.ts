import "dotenv/config";
import { gunzipSync } from "zlib";
import { prisma } from "../src/lib/prisma";
import { fetchBulkDataUrl } from "../src/lib/scryfall";

// Replaces OracleTag/CardOracleTag with Scryfall's oracle_tags bulk file. Run
// after sync:cards — taggings for cards we don't hold (not commander-legal or
// banned) are dropped, since CardOracleTag points at Card.

const CHUNK = 5000;

type BulkTag = {
  id: string;
  slug: string;
  label: string;
  description?: string | null;
  type: string;
  parent_ids?: string[];
  taggings?: { oracle_id: string }[];
};

/** A tag plus every ancestor, guarded against cycles in community data. */
function withAncestors(tagId: string, tags: Map<string, BulkTag>): Set<string> {
  const seen = new Set<string>();
  const stack = [tagId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id) || !tags.has(id)) continue;
    seen.add(id);
    stack.push(...(tags.get(id)!.parent_ids ?? []));
  }
  return seen;
}

async function run() {
  console.log("Fetching Scryfall oracle tags URL...");
  const url = await fetchBulkDataUrl("oracle_tags");

  // ~6MB gzipped, so it's read whole rather than streamed like the card file.
  const res = await fetch(url, { headers: { "User-Agent": "mtg-deck-builder/1.0" } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");

  const tags = new Map<string, BulkTag>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const tag = JSON.parse(line) as BulkTag;
    if (tag.type === "oracle") tags.set(tag.id, tag);
  }

  const known = new Set(
    (await prisma.card.findMany({ select: { id: true } })).map((c) => c.id)
  );

  // cardId → tagId → direct?
  const byCard = new Map<string, Map<string, boolean>>();
  for (const tag of tags.values()) {
    const lineage = withAncestors(tag.id, tags);
    for (const { oracle_id } of tag.taggings ?? []) {
      if (!known.has(oracle_id)) continue;
      const cardTags = byCard.get(oracle_id) ?? new Map<string, boolean>();
      for (const id of lineage) {
        cardTags.set(id, cardTags.get(id) === true || id === tag.id);
      }
      byCard.set(oracle_id, cardTags);
    }
  }

  const rows = [...byCard].flatMap(([cardId, cardTags]) =>
    [...cardTags].map(([tagId, direct]) => ({ cardId, tagId, direct }))
  );
  console.log(`${tags.size} tags, ${byCard.size} cards, ${rows.length} taggings (ancestors included)`);

  // One transaction, so the analysis page never reads a half-written table.
  await prisma.$transaction(
    async (tx) => {
      await tx.cardOracleTag.deleteMany();
      await tx.oracleTag.deleteMany();
      await tx.oracleTag.createMany({
        data: [...tags.values()].map((t) => ({
          id: t.id,
          slug: t.slug,
          label: t.label,
          description: t.description || null,
          parentIds: (t.parent_ids ?? []).filter((id) => tags.has(id)),
        })),
      });
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.cardOracleTag.createMany({ data: rows.slice(i, i + CHUNK) });
        process.stdout.write(`\r${Math.min(i + CHUNK, rows.length)}/${rows.length} taggings`);
      }
    },
    { timeout: 10 * 60_000, maxWait: 30_000 }
  );

  console.log("\nDone.");
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
