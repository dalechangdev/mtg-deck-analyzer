import type { CardDetail } from "@/components/cards/card-detail-modal";

// Shared Postgres → CardDetail glue. Any page that opens the card modal pulls
// the same printing/face shape, so the query and the mapper live together here.

type ImageUris = { small?: string; normal?: string; large?: string; png?: string };

type PrintingRow = {
  imageUris: unknown;
  setName: string;
  setCode: string;
  rarity: string;
  collectorNumber: string;
  scryfallUri: string | null;
};

type FaceRow = {
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  imageUri: string | null;
};

type CardRow = {
  id: string;
  name: string;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  oracleText: string | null;
  colorIdentity: string[];
  keywords: string[];
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  canBeCommander: boolean;
  printings: PrintingRow[];
  faces: FaceRow[];
};

/** Newest printing first, all faces in order — what `toCardDetail` expects. */
export const cardDetailInclude = {
  printings: { take: 1, orderBy: { setCode: "desc" } },
  faces: { orderBy: { faceIndex: "asc" } },
} as const;

export function toImageUrl(
  printings: { imageUris: unknown }[],
  faces: { imageUri: string | null }[]
): string | null {
  const uris = printings[0]?.imageUris as ImageUris | null;
  return uris?.normal ?? uris?.small ?? faces[0]?.imageUri ?? null;
}

export function toLargeImageUrl(
  printings: { imageUris: unknown }[],
  faces: { imageUri: string | null }[]
): string | null {
  const uris = printings[0]?.imageUris as ImageUris | null;
  return uris?.large ?? uris?.png ?? uris?.normal ?? uris?.small ?? faces[0]?.imageUri ?? null;
}

export function toCardDetail(card: CardRow): CardDetail {
  const printing = card.printings[0];
  return {
    id: card.id,
    name: card.name,
    manaCost: card.manaCost,
    cmc: card.cmc,
    typeLine: card.typeLine,
    oracleText: card.oracleText,
    colorIdentity: card.colorIdentity,
    keywords: card.keywords,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    canBeCommander: card.canBeCommander,
    imageUrl: toImageUrl(card.printings, card.faces),
    largeImageUrl: toLargeImageUrl(card.printings, card.faces),
    setName: printing?.setName ?? null,
    setCode: printing?.setCode ?? null,
    rarity: printing?.rarity ?? null,
    collectorNumber: printing?.collectorNumber ?? null,
    scryfallUri: printing?.scryfallUri ?? null,
    faces: card.faces.map((f) => ({
      name: f.name,
      manaCost: f.manaCost,
      typeLine: f.typeLine,
      oracleText: f.oracleText,
      power: f.power,
      toughness: f.toughness,
      loyalty: f.loyalty,
      imageUrl: f.imageUri,
    })),
  };
}
