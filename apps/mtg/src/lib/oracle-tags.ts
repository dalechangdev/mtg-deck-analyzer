import { prisma } from "@/lib/prisma";

/**
 * Tagger roots whose subtrees describe the card as an object — its name, its
 * cycle, its type line's rarity — rather than what it does in a game. Slugs.
 * The tag graph hides them by default; rules-structure tags like "triggered
 * ability" stay, since their subtrees hold real hooks ("cast trigger").
 */
export const TRIVIA_TAG_ROOTS = [
  "card-names",
  "cycle",
  "flavors-of-vanilla",
  "staple-with-set-s-mechanic",
  "unique-type-line",
];

/** Labels of every trivia root and its descendants, via `parentIds`. */
export async function loadTriviaTagLabels(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ label: string }[]>`
    WITH RECURSIVE trivia AS (
      SELECT id, label FROM "OracleTag" WHERE slug = ANY(${TRIVIA_TAG_ROOTS})
      UNION
      SELECT o.id, o.label FROM "OracleTag" o JOIN trivia t ON t.id = ANY(o."parentIds")
    )
    SELECT label FROM trivia
  `;
  return rows.map((r) => r.label);
}
