"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Creates a deck from a saved search and opens it. */
export function SaveAsDeckButton({ id }: { id: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/prices/searches/${id}/deck`, { method: "POST" });
    if (res.ok) {
      const { id: deckId } = (await res.json()) as { id: string };
      router.push(`/decks/${deckId}`);
    } else {
      setSaving(false);
      setError("Couldn't create the deck");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={saving}
        className={cn(buttonVariants({ variant: "outline" }), "disabled:opacity-50")}
      >
        {saving ? "Creating deck…" : "Save as deck"}
      </button>
      {error && <span className="text-body text-destructive">{error}</span>}
    </>
  );
}
