/**
 * The card-search vocabulary shared by the Advanced Search modal and
 * /api/cards. Nothing here touches Prisma or the DOM, so the browser can build
 * exactly the query string the route parses back.
 *
 * The field set mirrors Scryfall's advanced search page, minus the four
 * sections our local Card table has no data for: prices, artist, flavour text
 * and language. Two extras earn their place because we do have the data —
 * card themes (our stand-in for Scryfall's "criteria") and library ownership.
 */

export type ColorMode = "exact" | "including" | "atmost";
export type MatchMode = "all" | "any";
export type OwnedMode = "any" | "owned" | "unowned";
export type StatField = "cmc" | "power" | "toughness" | "loyalty";
export type StatOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
export type SortField =
  | "name"
  | "cmc"
  | "power"
  | "toughness"
  | "rarity"
  | "type"
  | "color";
export type SortDir = "asc" | "desc";

export interface StatFilter {
  field: StatField;
  op: StatOp;
  value: string;
}

export interface CardQuery {
  /** Every word must appear somewhere in the name. */
  name: string;
  /** Oracle text fragments; `oracleMode` decides whether all must hit. */
  oracle: string[];
  oracleMode: MatchMode;
  /** Type-line fragments — picked from the type list or typed freehand. */
  types: string[];
  typeMode: MatchMode;
  /** WUBRG letters, plus "C" for colorless. */
  colors: string[];
  colorMode: ColorMode;
  /** Colour identity — the Commander-legality axis. */
  identity: string[];
  identityMode: ColorMode;
  /** Mana symbols the cost must contain, e.g. "{W}{W}" or "2WW". */
  manaCost: string;
  stats: StatFilter[];
  rarities: string[];
  /** Set codes; a card matches if any one printing is in a chosen set. */
  sets: string[];
  keywords: string[];
  keywordMode: MatchMode;
  themes: string[];
  themeMode: MatchMode;
  commanderLegal: boolean;
  canBeCommander: boolean;
  owned: OwnedMode;
  sort: SortField;
  dir: SortDir;
}

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  exact: "Exactly these colors",
  including: "Including these colors",
  atmost: "At most these colors",
};

export const MATCH_MODE_LABELS: Record<MatchMode, string> = {
  all: "Match all",
  any: "Match any",
};

export const STAT_FIELD_LABELS: Record<StatField, string> = {
  cmc: "mana value",
  power: "power",
  toughness: "toughness",
  loyalty: "loyalty",
};

export const STAT_OP_LABELS: Record<StatOp, string> = {
  eq: "=",
  ne: "≠",
  lt: "<",
  lte: "≤",
  gt: ">",
  gte: "≥",
};

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  name: "Name",
  cmc: "Mana value",
  power: "Power",
  toughness: "Toughness",
  rarity: "Rarity",
  type: "Type line",
  color: "Color",
};

export const OWNED_LABELS: Record<OwnedMode, string> = {
  any: "Any card",
  owned: "In my library",
  unowned: "Not in my library",
};

export const RARITIES = ["common", "uncommon", "rare", "mythic", "special"] as const;

export const RARITY_LABELS: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  mythic: "Mythic",
  special: "Special",
};

/** The colour picker's options — WUBRG plus Scryfall's colorless checkbox. */
export const SEARCH_COLORS = ["W", "U", "B", "R", "G", "C"] as const;

/**
 * The option lists the Advanced Search pickers offer, served by
 * /api/cards/facets — derived from the local pool rather than hardcoded, so a
 * card sync brings new sets and creature types along with it.
 */
export interface CardFacets {
  sets: { code: string; name: string; count: number }[];
  types: string[];
  subtypes: string[];
  keywords: string[];
  themes: { id: string; name: string }[];
}

export const EMPTY_FACETS: CardFacets = {
  sets: [],
  types: [],
  subtypes: [],
  keywords: [],
  themes: [],
};

export const EMPTY_QUERY: CardQuery = {
  name: "",
  oracle: [],
  oracleMode: "all",
  types: [],
  typeMode: "all",
  colors: [],
  colorMode: "including",
  identity: [],
  identityMode: "atmost",
  manaCost: "",
  stats: [],
  rarities: [],
  sets: [],
  keywords: [],
  keywordMode: "all",
  themes: [],
  themeMode: "any",
  commanderLegal: true,
  canBeCommander: false,
  owned: "any",
  sort: "name",
  dir: "asc",
};

export function emptyQuery(overrides: Partial<CardQuery> = {}): CardQuery {
  return { ...EMPTY_QUERY, ...overrides };
}

const STAT_FIELDS = new Set<string>(["cmc", "power", "toughness", "loyalty"]);
const STAT_OPS = new Set<string>(["eq", "ne", "lt", "lte", "gt", "gte"]);

function pick<T extends string>(
  raw: string | null,
  allowed: Record<T, unknown>,
  fallback: T
): T {
  return raw && raw in allowed ? (raw as T) : fallback;
}

function list(raw: string | null): string[] {
  return raw?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
}

/** Serialises a query into the shape `parseCardQuery` reads back. */
export function cardQueryToParams(query: CardQuery): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value) params.set(key, value);
  };

  set("name", query.name.trim());
  for (const term of query.oracle) {
    if (term.trim()) params.append("oracle", term.trim());
  }
  if (query.oracle.filter((t) => t.trim()).length > 1) {
    set("oracleMode", query.oracleMode);
  }
  for (const type of query.types) params.append("type", type);
  if (query.types.length > 1) set("typeMode", query.typeMode);

  set("c", query.colors.join(","));
  if (query.colors.length > 0) set("cMode", query.colorMode);
  set("ci", query.identity.join(","));
  if (query.identity.length > 0) set("ciMode", query.identityMode);

  set("mana", query.manaCost.trim());
  for (const stat of query.stats) {
    if (stat.value.trim()) {
      params.append("stat", `${stat.field}:${stat.op}:${stat.value.trim()}`);
    }
  }

  set("rarity", query.rarities.join(","));
  set("set", query.sets.join(","));
  set("kw", query.keywords.join(","));
  if (query.keywords.length > 1) set("kwMode", query.keywordMode);
  set("theme", query.themes.join(","));
  if (query.themes.length > 1) set("themeMode", query.themeMode);

  // `commanderLegal` defaults to on, so only the opt-out needs a param.
  if (!query.commanderLegal) params.set("legal", "0");
  if (query.canBeCommander) params.set("commander", "1");
  if (query.owned !== "any") params.set("owned", query.owned);
  if (query.sort !== "name") params.set("sort", query.sort);
  if (query.dir !== "asc") params.set("dir", query.dir);

  return params;
}

/**
 * Reads a query back out of a URL. Also understands the two legacy params the
 * library manager and the new-deck form still send: `q` (name) and `colors`
 * (loose colour-identity filter, kept bug-for-bug in `buildCardWhere`).
 */
export function parseCardQuery(params: URLSearchParams): CardQuery {
  const oracle = params.getAll("oracle").filter(Boolean);
  const types = params.getAll("type").filter(Boolean);
  const stats: StatFilter[] = [];
  for (const raw of params.getAll("stat")) {
    const [field, op, ...rest] = raw.split(":");
    const value = rest.join(":");
    if (STAT_FIELDS.has(field) && STAT_OPS.has(op) && value.trim()) {
      stats.push({ field: field as StatField, op: op as StatOp, value });
    }
  }

  return {
    name: params.get("name") ?? params.get("q") ?? "",
    oracle,
    oracleMode: pick(params.get("oracleMode"), MATCH_MODE_LABELS, "all"),
    types,
    typeMode: pick(params.get("typeMode"), MATCH_MODE_LABELS, "all"),
    colors: list(params.get("c")),
    colorMode: pick(params.get("cMode"), COLOR_MODE_LABELS, "including"),
    identity: list(params.get("ci")),
    identityMode: pick(params.get("ciMode"), COLOR_MODE_LABELS, "atmost"),
    manaCost: params.get("mana") ?? "",
    stats,
    rarities: list(params.get("rarity")),
    sets: list(params.get("set")),
    keywords: list(params.get("kw")),
    keywordMode: pick(params.get("kwMode"), MATCH_MODE_LABELS, "all"),
    themes: list(params.get("theme")),
    themeMode: pick(params.get("themeMode"), MATCH_MODE_LABELS, "any"),
    commanderLegal: params.get("legal") !== "0",
    canBeCommander: params.get("commander") === "1",
    owned: pick(params.get("owned"), OWNED_LABELS, "any"),
    sort: pick(params.get("sort"), SORT_FIELD_LABELS, "name"),
    dir: params.get("dir") === "desc" ? "desc" : "asc",
  };
}

/**
 * Splits a mana-cost box into individual symbols. Accepts Scryfall's braced
 * form (`{2}{W}{W}`) and the shorthand people actually type (`2WW`).
 */
export function parseManaSymbols(input: string): string[] {
  const symbols: string[] = [];
  for (const match of input.matchAll(/\{([^}]+)\}/g)) {
    symbols.push(`{${match[1].toUpperCase().trim()}}`);
  }
  const bare = input.replace(/\{[^}]*\}/g, " ");
  for (const token of bare.match(/\d+|[wubrgcxyzs]/gi) ?? []) {
    symbols.push(`{${token.toUpperCase()}}`);
  }
  return symbols;
}

/**
 * A removable summary chip per active filter. `base` is the query the panel
 * starts from (the commander's colour identity, say), so pre-seeded defaults
 * don't show up as things the user chose.
 */
export type FilterChip = { key: string; label: string };

export function activeFilterChips(query: CardQuery, base: CardQuery = EMPTY_QUERY): FilterChip[] {
  const chips: FilterChip[] = [];
  const colorText = (colors: string[]) => colors.join("");

  if (query.name.trim() && query.name !== base.name) {
    chips.push({ key: "name", label: `name: ${query.name.trim()}` });
  }
  const oracle = query.oracle.filter((t) => t.trim());
  if (oracle.length > 0) {
    chips.push({
      key: "oracle",
      label: `text: ${oracle.join(query.oracleMode === "all" ? " + " : " / ")}`,
    });
  }
  if (query.types.length > 0) {
    chips.push({
      key: "types",
      label: `type: ${query.types.join(query.typeMode === "all" ? " + " : " / ")}`,
    });
  }
  if (query.colors.length > 0) {
    chips.push({
      key: "colors",
      label: `${COLOR_MODE_LABELS[query.colorMode].toLowerCase()}: ${colorText(query.colors)}`,
    });
  }
  if (query.identity.length > 0 && colorText(query.identity) !== colorText(base.identity)) {
    chips.push({ key: "identity", label: `identity: ${colorText(query.identity)}` });
  }
  if (query.manaCost.trim()) {
    chips.push({ key: "manaCost", label: `cost: ${query.manaCost.trim()}` });
  }
  query.stats.forEach((stat, index) => {
    if (stat.value.trim()) {
      chips.push({
        key: `stat:${index}`,
        label: `${STAT_FIELD_LABELS[stat.field]} ${STAT_OP_LABELS[stat.op]} ${stat.value.trim()}`,
      });
    }
  });
  if (query.rarities.length > 0) {
    chips.push({ key: "rarities", label: `rarity: ${query.rarities.join(", ")}` });
  }
  if (query.sets.length > 0) {
    chips.push({
      key: "sets",
      label: `set: ${query.sets.slice(0, 3).join(", ").toUpperCase()}${
        query.sets.length > 3 ? ` +${query.sets.length - 3}` : ""
      }`,
    });
  }
  if (query.keywords.length > 0) {
    chips.push({ key: "keywords", label: `keyword: ${query.keywords.join(", ")}` });
  }
  if (query.themes.length > 0) {
    chips.push({ key: "themes", label: `theme: ${query.themes.join(", ")}` });
  }
  if (query.commanderLegal !== base.commanderLegal) {
    chips.push({ key: "commanderLegal", label: "any legality" });
  }
  if (query.canBeCommander !== base.canBeCommander) {
    chips.push({ key: "canBeCommander", label: "can be a commander" });
  }
  if (query.owned !== "any") {
    chips.push({ key: "owned", label: OWNED_LABELS[query.owned].toLowerCase() });
  }
  if (query.sort !== base.sort || query.dir !== base.dir) {
    chips.push({
      key: "sort",
      label: `sort: ${SORT_FIELD_LABELS[query.sort].toLowerCase()} ${
        query.dir === "asc" ? "↑" : "↓"
      }`,
    });
  }
  return chips;
}

/** Undoes one summary chip, restoring that field to the panel's base query. */
export function clearFilter(query: CardQuery, key: string, base: CardQuery = EMPTY_QUERY): CardQuery {
  if (key.startsWith("stat:")) {
    const index = Number(key.slice(5));
    return { ...query, stats: query.stats.filter((_, i) => i !== index) };
  }
  switch (key) {
    case "name":
      return { ...query, name: base.name };
    case "oracle":
      return { ...query, oracle: [] };
    case "types":
      return { ...query, types: [] };
    case "colors":
      return { ...query, colors: [] };
    case "identity":
      return { ...query, identity: base.identity, identityMode: base.identityMode };
    case "manaCost":
      return { ...query, manaCost: "" };
    case "rarities":
      return { ...query, rarities: [] };
    case "sets":
      return { ...query, sets: [] };
    case "keywords":
      return { ...query, keywords: [] };
    case "themes":
      return { ...query, themes: [] };
    case "commanderLegal":
      return { ...query, commanderLegal: base.commanderLegal };
    case "canBeCommander":
      return { ...query, canBeCommander: base.canBeCommander };
    case "owned":
      return { ...query, owned: "any" };
    case "sort":
      return { ...query, sort: base.sort, dir: base.dir };
    default:
      return query;
  }
}
