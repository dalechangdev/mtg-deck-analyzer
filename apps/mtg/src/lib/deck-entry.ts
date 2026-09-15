import type { Prisma } from "@/generated/prisma/client";
import type { DeckEntry, DeckSlot } from "@/lib/commander";
import { toImageUrl } from "@/lib/card-detail";

// The one DeckCard row → DeckEntry mapper. It used to be copied into every page
// and handler that loaded a deck's cards; keep new loaders on it.

/** Newest printing and first face — all `toDeckEntry` needs for the image. */
export const deckEntryInclude = {
  card: {
    include: {
      printings: { take: 1, orderBy: { setCode: "desc" } },
      faces: { take: 1, orderBy: { faceIndex: "asc" } },
    },
  },
} as const;

/** Commander first, then alphabetical — the order every deck view renders. */
export const deckEntryOrderBy = [
  { isCommander: "desc" },
  { card: { name: "asc" } },
] satisfies Prisma.DeckCardOrderByWithRelationInput[];

type DeckCardRow = {
  id: string;
  isCommander: boolean;
  quantity: number;
  slot: string;
  card: {
    id: string;
    name: string;
    manaCost: string | null;
    cmc: number;
    typeLine: string;
    oracleText: string | null;
    colorIdentity: string[];
    keywords: string[];
    canBeCommander: boolean;
    /** Present whenever the query reads every Card column (`include`, not `select`). */
    producedMana?: string[];
    layout?: string | null;
    printings: { imageUris: unknown }[];
    faces: { imageUri: string | null }[];
    /** Include it filtered to the viewer (`where: { userId }`) to get ownedQuantity. */
    libraryEntries?: { quantity: number }[];
  };
};

export function toDeckEntry(dc: DeckCardRow): DeckEntry {
  return {
    deckCardId: dc.id,
    isCommander: dc.isCommander,
    quantity: dc.quantity,
    slot: dc.slot as DeckSlot,
    cardId: dc.card.id,
    name: dc.card.name,
    manaCost: dc.card.manaCost,
    cmc: dc.card.cmc,
    typeLine: dc.card.typeLine,
    oracleText: dc.card.oracleText,
    colorIdentity: dc.card.colorIdentity,
    keywords: dc.card.keywords,
    canBeCommander: dc.card.canBeCommander,
    imageUrl: toImageUrl(dc.card.printings, dc.card.faces),
    // The land base matrix reads these; loaders that `select` fewer columns omit them.
    ...(dc.card.producedMana && { producedMana: dc.card.producedMana }),
    ...(dc.card.layout !== undefined && { layout: dc.card.layout }),
    ...(dc.card.libraryEntries && {
      ownedQuantity: dc.card.libraryEntries[0]?.quantity ?? 0,
    }),
  };
}
