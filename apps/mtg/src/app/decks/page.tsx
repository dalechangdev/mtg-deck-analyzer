import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/ui/shell";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const userId = await requireUserId();

  const decks = await prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      cards: {
        where: { isCommander: true },
        include: {
          card: {
            include: {
              printings: { take: 1, orderBy: { setCode: "desc" } },
              faces: { take: 1, orderBy: { faceIndex: "asc" } },
            },
          },
        },
        take: 1,
      },
      _count: { select: { cards: true } },
    },
  });

  return (
    <PageShell className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-title font-semibold">Decks</h1>
        <Link href="/decks/new" className={cn(buttonVariants({ size: "sm" }))}>
          New Deck
        </Link>
      </div>

      {decks.length === 0 ? (
        <p className="text-muted-foreground text-ui">
          No decks yet.{" "}
          <Link href="/decks/new" className="underline hover:text-foreground">
            Create your first deck.
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {decks.map((deck) => {
            const commanderCard = deck.cards[0]?.card;
            const printing = commanderCard?.printings[0];
            const imageUris = printing?.imageUris as Record<string, string> | null;
            const imageUrl =
              imageUris?.art_crop ?? imageUris?.normal ?? commanderCard?.faces[0]?.imageUri ?? null;

            return (
              <Link
                key={deck.id}
                href={`/decks/${deck.id}`}
                className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
              >
                <div className="h-28 bg-muted overflow-hidden">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={commanderCard?.name ?? ""}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-body">
                      No Commander
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-0.5">
                  <div className="font-medium text-ui truncate">{deck.name}</div>
                  {commanderCard && (
                    <div className="text-body text-muted-foreground truncate">{commanderCard.name}</div>
                  )}
                  <div className="text-body text-muted-foreground">{deck._count.cards} / 100 cards</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
