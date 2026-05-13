import Link from "next/link";
import { CardThumbnail } from "./card-thumbnail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

type CardWithRelations = Prisma.CardGetPayload<{
  include: {
    printings: true;
    faces: true;
  };
}>;

function getImageUrl(card: CardWithRelations): string | null {
  const printing = card.printings[0];
  if (printing?.imageUris) {
    const uris = printing.imageUris as { normal?: string; small?: string };
    return uris.normal ?? uris.small ?? null;
  }
  return card.faces[0]?.imageUri ?? null;
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
          <CardThumbnail
            key={card.id}
            card={{
              id: card.id,
              name: card.name,
              manaCost: card.manaCost,
              typeLine: card.typeLine,
              oracleText: card.oracleText,
              colorIdentity: card.colorIdentity,
              canBeCommander: card.canBeCommander,
              imageUrl: getImageUrl(card),
            }}
          />
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
