"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { CardData } from "@/lib/commander";

interface Props {
  value: CardData | null;
  onChange: (commander: CardData | null) => void;
  autoFocus?: boolean;
}

/** Type-ahead over cards that can be a commander; shows the pick once chosen. */
export function CommanderPicker({ value, onChange, autoFocus }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardData[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Below two characters there's nothing to show, whatever the last fetch returned.
  const visible = query.length < 2 ? [] : results;

  useEffect(() => {
    if (query.length < 2) return;
    clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/cards?q=${encodeURIComponent(query)}&commander=1&limit=8`);
      if (res.ok) setResults(await res.json());
    }, 300);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/40">
        {value.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.imageUrl} alt={value.name} className="w-10 rounded-md" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-ui truncate">{value.name}</div>
          <div className="text-body text-muted-foreground truncate">{value.typeLine}</div>
        </div>
        <button
          type="button"
          onClick={() => { onChange(null); setQuery(""); }}
          className="text-muted-foreground hover:text-foreground text-body px-2"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search legendary creatures…"
        autoFocus={autoFocus}
      />
      {visible.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {visible.map((card) => (
            <button
              key={card.cardId}
              type="button"
              onClick={() => { onChange(card); setResults([]); setQuery(""); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left"
            >
              {card.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt={card.name} className="w-8 rounded-md flex-shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-ui font-medium truncate">{card.name}</div>
                <div className="text-body text-muted-foreground truncate">{card.typeLine}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
