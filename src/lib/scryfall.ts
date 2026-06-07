const SCRYFALL_API = "https://api.scryfall.com";
const BULK_DATA_TYPE = "default_cards";

export interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  keywords: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  legalities: Record<string, string>;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  set: string;
  set_name: string;
  rarity: string;
  collector_number: string;
  scryfall_uri: string;
}

export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: ScryfallImageUris;
}

export interface ScryfallImageUris {
  small: string;
  normal: string;
  large: string;
  png: string;
  art_crop: string;
  border_crop: string;
}

export interface ScryfallSet {
  id: string;
  code: string;
  name: string;
  set_type: string;
  card_count: number;
  released_at?: string;
  digital: boolean;
  icon_svg_uri?: string;
}

// Set types that come in draftable booster packs — what you can physically open.
const BOOSTER_SET_TYPES = new Set(["core", "expansion", "masters", "draft_innovation"]);

export async function fetchSets(): Promise<ScryfallSet[]> {
  const res = await fetch(`${SCRYFALL_API}/sets`, {
    headers: { "User-Agent": "mtg-deck-builder/1.0" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Scryfall sets fetch failed: ${res.status}`);
  const data = await res.json();
  const sets = data.data as ScryfallSet[];
  return sets
    .filter((s) => BOOSTER_SET_TYPES.has(s.set_type) && !s.digital && s.card_count > 0)
    .sort((a, b) => (b.released_at ?? "").localeCompare(a.released_at ?? ""));
}

// Cards belonging to a single set, optionally filtered by a name query,
// ordered by collector number to mirror flipping through a pack.
export async function searchSetCards(
  setCode: string,
  query: string,
  page = 1
): Promise<{ data: ScryfallCard[]; hasMore: boolean }> {
  const q = `set:${setCode}` + (query.trim() ? ` ${query.trim()}` : "");
  const params = new URLSearchParams({ q, page: String(page), order: "set", unique: "prints" });
  const res = await fetch(`${SCRYFALL_API}/cards/search?${params}`, {
    headers: { "User-Agent": "mtg-deck-builder/1.0" },
    next: { revalidate: 3600 },
  });
  if (res.status === 404) return { data: [], hasMore: false };
  if (!res.ok) throw new Error(`Scryfall set search failed: ${res.status}`);
  const data = await res.json();
  return { data: data.data, hasMore: data.has_more };
}

// Authoritative lookup of specific printings by Scryfall card id (batches of 75).
export async function fetchCollection(scryfallIds: string[]): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = [];
  for (let i = 0; i < scryfallIds.length; i += 75) {
    const identifiers = scryfallIds.slice(i, i + 75).map((id) => ({ id }));
    const res = await fetch(`${SCRYFALL_API}/cards/collection`, {
      method: "POST",
      headers: { "User-Agent": "mtg-deck-builder/1.0", "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers }),
    });
    if (!res.ok) throw new Error(`Scryfall collection fetch failed: ${res.status}`);
    const data = await res.json();
    out.push(...(data.data as ScryfallCard[]));
  }
  return out;
}

export async function fetchBulkDataUrl(): Promise<string> {
  const res = await fetch(`${SCRYFALL_API}/bulk-data/${BULK_DATA_TYPE}`, {
    headers: { "User-Agent": "mtg-deck-builder/1.0" },
  });
  if (!res.ok) throw new Error(`Scryfall bulk-data fetch failed: ${res.status}`);
  const data = await res.json();
  return data.download_uri as string;
}

export async function searchCards(query: string, page = 1): Promise<{ data: ScryfallCard[]; hasMore: boolean }> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  const res = await fetch(`${SCRYFALL_API}/cards/search?${params}`, {
    headers: { "User-Agent": "mtg-deck-builder/1.0" },
  });
  if (res.status === 404) return { data: [], hasMore: false };
  if (!res.ok) throw new Error(`Scryfall search failed: ${res.status}`);
  const data = await res.json();
  return { data: data.data, hasMore: data.has_more };
}

export function canBeCommander(card: ScryfallCard): boolean {
  const type = card.type_line?.toLowerCase() ?? "";
  if (type.includes("legendary") && type.includes("creature")) return true;
  if (card.oracle_text?.toLowerCase().includes("can be your commander")) return true;
  return false;
}
