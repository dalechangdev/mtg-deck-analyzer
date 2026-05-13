import { NewDeckForm } from "@/components/decks/new-deck-form";

export default function NewDeckPage() {
  return (
    <div className="px-6 py-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">New Deck</h1>
      <NewDeckForm />
    </div>
  );
}
