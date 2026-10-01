import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { listSearches } from "@/lib/price-history";
import { PastSearches } from "@/components/prices/past-searches";
import { buttonVariants } from "@/components/ui/button";
import { PageShell } from "@/components/ui/shell";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const userId = await requireUserId();
  const searches = await listSearches(userId);

  return (
    <PageShell className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-title font-semibold">Ítaca prices</h1>
          <p className="text-ui text-muted-foreground">
            Your past price searches, newest first. Each shows the prices and stock at the
            time it ran.
          </p>
        </div>
        <Link href="/prices/search" className={cn(buttonVariants(), "shrink-0")}>
          New search
        </Link>
      </div>

      {searches.length > 0 ? (
        <PastSearches searches={searches} />
      ) : (
        <p className="text-ui text-muted-foreground">
          No searches yet.{" "}
          <Link href="/prices/search" className="underline underline-offset-2 hover:text-foreground">
            Price a decklist
          </Link>{" "}
          to start your history.
        </p>
      )}
    </PageShell>
  );
}
