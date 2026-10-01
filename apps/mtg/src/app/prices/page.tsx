import { requireUserId } from "@/lib/auth";
import { DecklistPricer } from "@/components/prices/decklist-pricer";
import { PageShell } from "@/components/ui/shell";

export default async function PricesPage() {
  await requireUserId();

  return (
    <PageShell className="max-w-4xl space-y-0">
      <h1 className="text-title font-semibold mb-1">Ítaca prices</h1>
      <p className="text-ui text-muted-foreground mb-6">
        Paste a decklist to see what it costs at Ítaca. Lookups run one every 5 seconds;
        prices are cached for a day.
      </p>
      <DecklistPricer />
    </PageShell>
  );
}
