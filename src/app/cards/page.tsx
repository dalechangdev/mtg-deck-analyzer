import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { CardSearchForm } from "@/components/cards/card-search-form";
import { CardGrid } from "@/components/cards/card-grid";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 40;

interface PageProps {
  searchParams: Promise<{ q?: string; colors?: string; page?: string; commander?: string }>;
}

export default async function CardsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q ?? "";
  const colors = params.colors ? params.colors.split(",").filter(Boolean) : [];
  const commanderOnly = params.commander === "1";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const where = {
    isCommanderLegal: true,
    ...(q && { name: { contains: q, mode: "insensitive" as const } }),
    ...(colors.length > 0 && { colorIdentity: { hasSome: colors } }),
    ...(commanderOnly && { canBeCommander: true }),
  };

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        printings: { take: 1, orderBy: { setCode: "desc" } },
        faces: { orderBy: { faceIndex: "asc" } },
      },
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.card.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="px-6 py-6 space-y-4">
      <h1 className="text-xl font-semibold">Cards</h1>

      <Suspense>
        <CardSearchForm
          initialQ={q}
          initialColors={colors}
          initialCommanderOnly={commanderOnly}
        />
      </Suspense>

      <p className="text-sm text-muted-foreground">
        {total === 0
          ? cards.length === 0 && !q && colors.length === 0
            ? "No cards in database. Run npm run sync:cards to import."
            : "No cards match your filters."
          : `${total.toLocaleString()} card${total !== 1 ? "s" : ""}`}
      </p>

      {cards.length > 0 && (
        <CardGrid
          cards={cards}
          page={page}
          totalPages={totalPages}
          searchParams={{ q: q || undefined, colors: colors.join(",") || undefined, commander: params.commander }}
        />
      )}
    </div>
  );
}

export function CardBrowserSkeleton() {
  return (
    <div className="px-6 py-6 space-y-4">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-10 w-80" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 mt-4">
        {Array.from({ length: 40 }).map((_, i) => (
          <Skeleton key={i} className="rounded-xl aspect-[63/88] w-full" />
        ))}
      </div>
    </div>
  );
}
