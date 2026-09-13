import { NewDeckForm } from "@/components/decks/new-deck-form";
import { PageShell } from "@/components/ui/shell";

export default function NewDeckPage() {
  return (
    <PageShell className="max-w-lg space-y-0">
      <h1 className="text-title font-semibold mb-6">New Deck</h1>
      <NewDeckForm />
    </PageShell>
  );
}
