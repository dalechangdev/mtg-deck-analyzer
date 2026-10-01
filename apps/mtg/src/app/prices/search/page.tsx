import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getSearch } from "@/lib/price-history";
import { DecklistPricer } from "@/components/prices/decklist-pricer";
import { PageShell } from "@/components/ui/shell";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ from?: string }> };

export default async function PriceSearchPage({ searchParams }: PageProps) {
  const userId = await requireUserId();
  const { from } = await searchParams;

  // "Price again": only ever the caller's own search, so another account's
  // id just leaves the form empty.
  const source = from ? await getSearch(userId, from) : null;

  return (
    <PageShell className="max-w-4xl space-y-0">
      <Link href="/prices" className="text-body text-muted-foreground hover:text-foreground">
        ← Past searches
      </Link>
      <h1 className="text-title font-semibold mb-1">New price search</h1>
      <p className="text-ui text-muted-foreground mb-6">
        Paste a decklist to see what it costs at Ítaca. Lookups run one every 5 seconds;
        prices are cached for a day. Each search is saved to your history.
      </p>
      <DecklistPricer
        key={source?.id ?? "new"}
        initialText={source?.text}
        initialSkipBasics={source?.skipBasics}
      />
    </PageShell>
  );
}
