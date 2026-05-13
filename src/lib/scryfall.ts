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
