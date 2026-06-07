import { prisma } from "@/lib/prisma";
import { LibraryManager } from "@/components/library/library-manager";
import type { LibraryEntry } from "@/components/library/library-manager";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const owned = await prisma.libraryCard.findMany({
    include: {
      card: {
        include: {
          printings: { take: 1, orderBy: { setCode: "desc" } },
          faces: { take: 1, orderBy: { faceIndex: "asc" } },
        },
      },
    },
    orderBy: { card: { name: "asc" } },
  });

  const entries: LibraryEntry[] = owned.map((lc) => {
    const printing = lc.card.printings[0];
    const imageUris = printing?.imageUris as Record<string, string> | null;
    const imageUrl = imageUris?.normal ?? imageUris?.small ?? lc.card.faces[0]?.imageUri ?? null;

    return {
      libraryCardId: lc.id,
      quantity: lc.quantity,
      cardId: lc.card.id,
      name: lc.card.name,
      manaCost: lc.card.manaCost,
      cmc: lc.card.cmc,
      typeLine: lc.card.typeLine,
      oracleText: lc.card.oracleText,
      colorIdentity: lc.card.colorIdentity,
      keywords: lc.card.keywords,
      canBeCommander: lc.card.canBeCommander,
      imageUrl,
    };
  });

  return <LibraryManager initialEntries={entries} />;
}
