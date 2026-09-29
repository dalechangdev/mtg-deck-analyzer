"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardData } from "@/lib/commander";
import { CommanderPicker } from "@/components/decks/commander-picker";

export function NewDeckForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [commander, setCommander] = useState<CardData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), commanderId: commander?.cardId ?? null }),
    });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/decks/${id}`);
    } else {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-ui font-medium">Deck Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Commander Deck"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-ui font-medium">Commander <span className="text-muted-foreground font-normal">(optional)</span></label>
        <CommanderPicker value={commander} onChange={setCommander} />
      </div>

      <button
        type="submit"
        disabled={!name.trim() || submitting}
        className={cn(buttonVariants(), "w-full disabled:opacity-50")}
      >
        {submitting ? "Creating…" : "Create Deck"}
      </button>
    </form>
  );
}
