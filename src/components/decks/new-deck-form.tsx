"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardData } from "@/lib/commander";

export function NewDeckForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [commanderQuery, setCommanderQuery] = useState("");
  const [results, setResults] = useState<CardData[]>([]);
  const [commander, setCommander] = useState<CardData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (commanderQuery.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/cards?q=${encodeURIComponent(commanderQuery)}&commander=1&limit=8`);
      if (res.ok) setResults(await res.json());
    }, 300);
  }, [commanderQuery]);

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
        <label className="text-sm font-medium">Deck Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Commander Deck"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Commander <span className="text-muted-foreground font-normal">(optional)</span></label>
        {commander ? (
          <div className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/40">
            {commander.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={commander.imageUrl} alt={commander.name} className="w-10 rounded" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{commander.name}</div>
              <div className="text-xs text-muted-foreground truncate">{commander.typeLine}</div>
            </div>
            <button
              type="button"
              onClick={() => { setCommander(null); setCommanderQuery(""); }}
              className="text-muted-foreground hover:text-foreground text-xs px-2"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <Input
              value={commanderQuery}
              onChange={(e) => setCommanderQuery(e.target.value)}
              placeholder="Search legendary creatures…"
            />
            {results.length > 0 && (
              <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                {results.map((card) => (
                  <button
                    key={card.cardId}
                    type="button"
                    onClick={() => { setCommander(card); setResults([]); setCommanderQuery(""); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left"
                  >
                    {card.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.imageUrl} alt={card.name} className="w-8 rounded flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{card.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{card.typeLine}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
