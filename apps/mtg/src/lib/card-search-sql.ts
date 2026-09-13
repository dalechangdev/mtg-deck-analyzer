import { Prisma } from "@/generated/prisma/client";
import {
  parseManaSymbols,
  type CardQuery,
  type ColorMode,
  type SortDir,
  type SortField,
  type StatFilter,
} from "./card-search";

/**
 * Turns a `CardQuery` into the WHERE/ORDER BY of a raw id query.
 *
 * Prisma's query builder can't express the three things this search needs
 * most: Postgres array containment for colour comparators, a numeric cast of
 * the text `power`/`toughness` columns, and ordering by a rarity rank pulled
 * from a related table. So the route selects matching ids in SQL and hydrates
 * that page through `prisma.card.findMany` — which keeps the row shaping (and
 * its relation includes) in one familiar place.
 *
 * Every user value goes in as a bound parameter; the only `Prisma.raw` calls
 * read from the fixed maps below.
 */

const COLOR_LETTERS = new Set(["W", "U", "B", "R", "G"]);

const STAT_SQL_OP: Record<StatFilter["op"], string> = {
  eq: "=",
  ne: "<>",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
};

const STAT_COLUMN: Record<"power" | "toughness" | "loyalty", string> = {
  power: "power",
  toughness: "toughness",
  loyalty: "loyalty",
};

/** Matches an integer or decimal, so `*` and `1+*` fall out of numeric filters. */
const NUMERIC_TEXT = "'^-?[0-9]+(\\.[0-9]+)?$'";

function textArray(values: string[]): Prisma.Sql {
  return Prisma.sql`ARRAY[${Prisma.join(values.map((v) => Prisma.sql`${v}`))}]::text[]`;
}

/** ILIKE `%value%`, with the user's own wildcards neutralised. */
function contains(column: Prisma.Sql, value: string): Prisma.Sql {
  const escaped = value.replace(/[\\%_]/g, "\\$&");
  return Prisma.sql`${column} ILIKE ${`%${escaped}%`}`;
}

/**
 * Card-level text is null on split/adventure/modal cards, where the real text
 * lives on the faces — so every text filter checks both.
 */
function cardOrFaceContains(column: "oracleText" | "typeLine", value: string): Prisma.Sql {
  const col = Prisma.raw(`"${column}"`);
  return Prisma.sql`(${contains(Prisma.sql`c.${col}`, value)} OR EXISTS (
    SELECT 1 FROM "CardFace" f WHERE f."cardId" = c.id AND ${contains(Prisma.sql`f.${col}`, value)}
  ))`;
}

function joinConditions(conditions: Prisma.Sql[], mode: "all" | "any"): Prisma.Sql {
  const glue = mode === "all" ? " AND " : " OR ";
  return Prisma.sql`(${Prisma.join(conditions, glue)})`;
}

function colorCondition(
  column: Prisma.Sql,
  selected: string[],
  mode: ColorMode
): Prisma.Sql | null {
  const letters = selected.filter((c) => COLOR_LETTERS.has(c));
  const colorless = selected.includes("C");
  if (letters.length === 0 && !colorless) return null;

  const isColorless = Prisma.sql`cardinality(${column}) = 0`;
  if (letters.length === 0) return isColorless;

  const array = textArray(letters);
  const base =
    mode === "exact"
      ? Prisma.sql`(${column} @> ${array} AND ${column} <@ ${array})`
      : mode === "including"
        ? Prisma.sql`${column} @> ${array}`
        : Prisma.sql`${column} <@ ${array}`;

  // "At most" already admits colourless cards; the other two need it spelled out.
  return colorless && mode !== "atmost" ? Prisma.sql`(${base} OR ${isColorless})` : base;
}

function statCondition(stat: StatFilter): Prisma.Sql | null {
  const value = Number(stat.value.trim());
  if (!stat.value.trim() || Number.isNaN(value)) return null;

  const op = Prisma.raw(STAT_SQL_OP[stat.op]);
  if (stat.field === "cmc") return Prisma.sql`c."cmc" ${op} ${value}`;

  const column = Prisma.raw(`c."${STAT_COLUMN[stat.field]}"`);
  const numeric = Prisma.raw(NUMERIC_TEXT);
  return Prisma.sql`(${column} ~ ${numeric} AND ${column}::numeric ${op} ${value})`;
}

/**
 * How many copies of each symbol the cost must contain. `{W}{W}` means two
 * white pips, not "mentions white", so occurrences are counted rather than
 * matched — the same way Scryfall reads its mana box.
 */
function manaCostConditions(input: string): Prisma.Sql[] {
  const counts = new Map<string, number>();
  for (const symbol of parseManaSymbols(input)) {
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  }
  return [...counts].map(
    ([symbol, count]) => Prisma.sql`(
      length(coalesce(c."manaCost", '')) -
      length(replace(coalesce(c."manaCost", ''), ${symbol}, ''))
    ) / ${symbol.length} >= ${count}`
  );
}

export interface LegacyOptions {
  /**
   * The old `colors` param: "identity overlaps any of these, or is colourless".
   * Loose by design — the deck builder dims the illegal results client-side —
   * and preserved verbatim so the library manager keeps behaving as it did.
   */
  legacyColors?: string[];
}

export function buildCardWhere(query: CardQuery, options: LegacyOptions = {}): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (query.commanderLegal) conditions.push(Prisma.sql`c."isCommanderLegal" = true`);
  if (query.canBeCommander) conditions.push(Prisma.sql`c."canBeCommander" = true`);

  for (const word of query.name.trim().split(/\s+/).filter(Boolean)) {
    conditions.push(contains(Prisma.sql`c."name"`, word));
  }

  const oracle = query.oracle.map((t) => t.trim()).filter(Boolean);
  if (oracle.length > 0) {
    conditions.push(
      joinConditions(
        oracle.map((term) => cardOrFaceContains("oracleText", term)),
        query.oracleMode
      )
    );
  }

  const types = query.types.map((t) => t.trim()).filter(Boolean);
  if (types.length > 0) {
    conditions.push(
      joinConditions(
        types.map((type) => cardOrFaceContains("typeLine", type)),
        query.typeMode
      )
    );
  }

  const colors = colorCondition(Prisma.sql`c."colors"`, query.colors, query.colorMode);
  if (colors) conditions.push(colors);

  const identity = colorCondition(
    Prisma.sql`c."colorIdentity"`,
    query.identity,
    query.identityMode
  );
  if (identity) conditions.push(identity);

  if (options.legacyColors && options.legacyColors.length > 0) {
    const array = textArray(options.legacyColors);
    conditions.push(
      Prisma.sql`(c."colorIdentity" && ${array} OR cardinality(c."colorIdentity") = 0)`
    );
  }

  conditions.push(...manaCostConditions(query.manaCost));

  for (const stat of query.stats) {
    const condition = statCondition(stat);
    if (condition) conditions.push(condition);
  }

  // Rarity and set describe a *printing*, so one printing has to satisfy both.
  const printing: Prisma.Sql[] = [];
  if (query.rarities.length > 0) {
    printing.push(Prisma.sql`p."rarity" = ANY(${textArray(query.rarities)})`);
  }
  if (query.sets.length > 0) {
    printing.push(Prisma.sql`lower(p."setCode") = ANY(${textArray(query.sets.map((s) => s.toLowerCase()))})`);
  }
  if (printing.length > 0) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "CardPrinting" p
      WHERE p."cardId" = c.id AND ${Prisma.join(printing, " AND ")}
    )`);
  }

  if (query.keywords.length > 0) {
    const array = textArray(query.keywords);
    conditions.push(
      query.keywordMode === "all"
        ? Prisma.sql`c."keywords" @> ${array}`
        : Prisma.sql`c."keywords" && ${array}`
    );
  }

  if (query.themes.length > 0) {
    // Prisma's implicit m2m join table for Card.themes: A = Card.id, B = CardTheme.id.
    const array = textArray(query.themes);
    conditions.push(
      query.themeMode === "all"
        ? Prisma.sql`(
            SELECT count(DISTINCT t."B") FROM "_CardToCardTheme" t
            WHERE t."A" = c.id AND t."B" = ANY(${array})
          ) = ${query.themes.length}`
        : Prisma.sql`EXISTS (
            SELECT 1 FROM "_CardToCardTheme" t
            WHERE t."A" = c.id AND t."B" = ANY(${array})
          )`
    );
  }

  if (query.owned !== "any") {
    const owned = Prisma.sql`EXISTS (
      SELECT 1 FROM "LibraryCard" l WHERE l."cardId" = c.id AND l."quantity" > 0
    )`;
    conditions.push(query.owned === "owned" ? owned : Prisma.sql`NOT ${owned}`);
  }

  if (conditions.length === 0) return Prisma.sql`true`;
  return Prisma.join(conditions, " AND ");
}

const RARITY_RANK = Prisma.sql`(
  SELECT max(CASE p."rarity"
    WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3
    WHEN 'mythic' THEN 4 ELSE 5 END)
  FROM "CardPrinting" p WHERE p."cardId" = c.id
)`;

function numericColumn(column: "power" | "toughness"): Prisma.Sql {
  const col = Prisma.raw(`c."${column}"`);
  return Prisma.sql`(CASE WHEN ${col} ~ ${Prisma.raw(NUMERIC_TEXT)} THEN ${col}::numeric END)`;
}

export function buildCardOrderBy(sort: SortField, dir: SortDir): Prisma.Sql {
  const direction = Prisma.raw(dir === "desc" ? "DESC NULLS LAST" : "ASC NULLS LAST");
  const key = (() => {
    switch (sort) {
      case "cmc":
        return Prisma.sql`c."cmc"`;
      case "power":
        return numericColumn("power");
      case "toughness":
        return numericColumn("toughness");
      case "rarity":
        return RARITY_RANK;
      case "type":
        return Prisma.sql`c."typeLine"`;
      case "color":
        return Prisma.sql`(cardinality(c."colors"), array_to_string(c."colors", ''))`;
      default:
        return Prisma.sql`c."name"`;
    }
  })();
  // Name then id keep paging stable when the sort key ties.
  return Prisma.sql`${key} ${direction}, c."name" ASC, c.id ASC`;
}
