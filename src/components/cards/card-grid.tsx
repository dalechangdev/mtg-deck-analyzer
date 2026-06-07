import Link from "next/link";
import { CardThumbnail } from "./card-thumbnail";
import type { CardDetail } from "./card-detail-modal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

type CardWithRelations = Prisma.CardGetPayload<{
  include: {
    printings: true;
    faces: true;
  };
}>;

type ImageUris = { small?: string; normal?: string; large?: string; png?: string };

// normal-size image for the grid thumbnail
function getThumbUrl(card: CardWithRelations): string | null {
  const uris = card.printings[0]?.imageUris as ImageUris | null;
  return uris?.normal ?? uris?.small ?? card.faces[0]?.imageUri ?? null;
}

// large-size image for the detail modal
function getLargeUrl(card: CardWithRelations): string | null {
  const uris = card.printings[0]?.imageUris as ImageUris | null;
  return uris?.large ?? uris?.png ?? uris?.normal ?? uris?.small ?? card.faces[0]?.imageUri ?? null;
}

function toCardDetail(card: CardWithRelations): CardDetail {
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
    imageUrl: getThumbUrl(card),
    largeImageUrl: getLargeUrl(card),
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

interface Props {
  cards: CardWithRelations[];
  page: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}

function pageUrl(searchParams: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v) params.set(k, v);
  }
  params.set("page", String(page));
  return `/cards?${params.toString()}`;
}

export function CardGrid({ cards, page, totalPages, searchParams }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {cards.map((card) => (
          <CardThumbnail key={card.id} card={toCardDetail(card)} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link href={pageUrl(searchParams, page - 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Previous
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "opacity-50 pointer-events-none")}>
              Previous
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageUrl(searchParams, page + 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Next
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "opacity-50 pointer-events-none")}>
              Next
            </span>
          )}
        </div>
      )}
    </div>
  );
}
