import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getSearch } from "@/lib/price-history";
import { formatCents, PriceTable } from "@/components/prices/price-table";
import { formatSearchDate } from "@/components/prices/past-searches";
import { DeleteSearchButton } from "@/components/prices/delete-search-button";
import { buttonVariants } from "@/components/ui/button";
import { PageShell } from "@/components/ui/shell";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function SavedPriceSearchPage({ params }: PageProps) {
  const userId = await requireUserId();
  const { id } = await params;

  // Scoped to the caller: another account's search is a 404, not a 403.
  const search = await getSearch(userId, id);
  if (!search) notFound();

  const { snapshot } = search;
  const results = new Map(snapshot.results.map((r) => [r.key, r]));
  const unchecked = new Set(snapshot.lines.filter((l) => l.key).map((l) => l.key)).size - results.size;

  return (
    <PageShell className="max-w-4xl space-y-6">
      <div className="space-y-1">
        <Link href="/prices" className="text-body text-muted-foreground hover:text-foreground">
          ← Past searches
        </Link>
        <h1 className="text-title font-semibold">{search.name}</h1>
        <p className="text-ui text-muted-foreground">
          Priced {formatSearchDate(search.createdAt)}. These are the prices and stock at that
          time; Ítaca may have changed since.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-lead font-semibold">
          {formatCents(search.totalCents, search.currency)}
          <span className="ml-2 text-ui font-normal text-muted-foreground">
            for {search.pricedCards} of {search.totalCards} cards
          </span>
        </p>
        <p className="text-body text-muted-foreground">
          {search.status === "stopped"
            ? `Stopped with ${unchecked} card${unchecked === 1 ? "" : "s"} not checked.`
            : "All cards checked."}
          {snapshot.skippedBasics > 0 && ` ${snapshot.skippedBasics} basic land lines skipped.`}
        </p>
        {snapshot.unparsed.length > 0 && (
          <p className="text-body text-destructive">Couldn&apos;t read: {snapshot.unparsed.join(", ")}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Link href={`/prices/search?from=${search.id}`} className={cn(buttonVariants())}>
          Price again
        </Link>
        <DeleteSearchButton id={search.id} />
      </div>

      <PriceTable lines={snapshot.lines} results={results} pendingLabel="Not checked" />
    </PageShell>
  );
}
