"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { CATEGORY_ORDER, getCardCategory } from "@/lib/commander";
import type { CardData } from "@/lib/commander";

export type LibraryEntry = CardData & {
  libraryCardId: string;
  quantity: number;
};

interface Props {
  initialEntries: LibraryEntry[];
}

const COLOR_LABELS: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const COLOR_STYLE: Record<string, string> = {
  W: "bg-yellow-50 border-yellow-400 text-yellow-900",
  U: "bg-blue-600 border-blue-800 text-white",
  B: "bg-zinc-900 border-zinc-600 text-zinc-100",
  R: "bg-red-600 border-red-800 text-white",
  G: "bg-green-700 border-green-900 text-white",
};

export function LibraryManager({ initialEntries }: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[]>(initialEntries);

  const distinctCount = entries.length;
  const totalCopies = useMemo(() => entries.reduce((s, e) => s + e.quantity, 0), [entries]);

  // Live ownership map so search badges update as you add — like search-panel's inMainIds
  const ownedByCardId = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.cardId, e.quantity);
    return m;
  }, [entries]);

  // --- Add a card (increment if already owned) ---
  const addCard = useCallback(
    async (card: CardData) => {
      const existing = entries.find((e) => e.cardId === card.cardId);
      if (existing) {
        setEntries((prev) =>
          prev.map((e) => (e.cardId === card.cardId ? { ...e, quantity: e.quantity + 1 } : e))
        );
        const res = await fetch(`/api/library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: card.cardId }),
        });
        if (!res.ok) {
          setEntries((prev) =>
            prev.map((e) => (e.cardId === card.cardId ? { ...e, quantity: e.quantity - 1 } : e))
          );
        }
        return;
      }

      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const optimistic: LibraryEntry = { ...card, libraryCardId: tempId, quantity: 1 };
      setEntries((prev) => [...prev, optimistic]);

      const res = await fetch(`/api/library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId }),
      });
      if (!res.ok) {
        setEntries((prev) => prev.filter((e) => e.libraryCardId !== tempId));
        return;
      }
      const { id: realId } = await res.json();
      setEntries((prev) =>
        prev.map((e) => (e.libraryCardId === tempId ? { ...e, libraryCardId: realId } : e))
      );
    },
    [entries]
  );

  // --- Set quantity (remove at 0) ---
  const setQuantity = useCallback(
    async (libraryCardId: string, quantity: number) => {
      if (quantity <= 0) {
        setEntries((prev) => prev.filter((e) => e.libraryCardId !== libraryCardId));
        await fetch(`/api/library/${libraryCardId}`, { method: "DELETE" });
        return;
      }
      setEntries((prev) =>
        prev.map((e) => (e.libraryCardId === libraryCardId ? { ...e, quantity } : e))
      );
      await fetch(`/api/library/${libraryCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
    },
    []
  );

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.reduce<Record<string, LibraryEntry[]>>((acc, cat) => {
      acc[cat] = entries
        .filter((e) => getCardCategory(e.typeLine) === cat)
        .sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name));
      return acc;
    }, {} as Record<string, LibraryEntry[]>);
  }, [entries]);

  return (
    <div className="flex flex-col h-[calc(100vh-49px)]">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border flex-shrink-0">
        <h1 className="text-sm font-medium">Library</h1>
        <span className="text-xs text-muted-foreground">
          {distinctCount} card{distinctCount !== 1 ? "s" : ""} · {totalCopies} cop
          {totalCopies !== 1 ? "ies" : "y"}
        </span>
        <button
          onClick={() => router.push("/packs")}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Open packs →
        </button>
        <button
          onClick={() => router.push("/decks")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Decks →
        </button>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 flex-shrink-0 border-r border-border overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Add Cards
          </div>
          <AddPanel ownedByCardId={ownedByCardId} onAdd={addCard} />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Owned Cards
          </div>
          <div className="flex-1 overflow-y-auto">
            {entries.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                Your library is empty. Search on the left to add cards you own.
              </div>
            ) : (
              CATEGORY_ORDER.map((cat) => {
                const cards = grouped[cat];
                if (!cards || cards.length === 0) return null;
                return (
                  <section key={cat} className="border-b border-border">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 sticky top-0">
                      {cat} ({cards.reduce((s, e) => s + e.quantity, 0)})
                    </div>
                    {cards.map((entry) => (
                      <OwnedRow key={entry.libraryCardId} entry={entry} onSetQuantity={setQuantity} />
                    ))}
                  </section>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnedRow({
  entry,
  onSetQuantity,
}: {
  entry: LibraryEntry;
  onSetQuantity: (libraryCardId: string, quantity: number) => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
      {entry.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.imageUrl} alt={entry.name} className="w-8 rounded flex-shrink-0" loading="lazy" />
      ) : (
        <div className="w-8 h-11 rounded bg-muted flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-xs truncate block">{entry.name}</span>
        {entry.manaCost && (
          <span className="text-[11px] text-muted-foreground font-mono">{entry.manaCost}</span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onSetQuantity(entry.libraryCardId, entry.quantity - 1)}
          title={entry.quantity <= 1 ? "Remove from library" : "Decrease"}
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-sm"
        >
          −
        </button>
        <span className="text-xs font-mono w-5 text-center tabular-nums">{entry.quantity}</span>
        <button
          onClick={() => onSetQuantity(entry.libraryCardId, entry.quantity + 1)}
          title="Increase"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-sm"
        >
          +
        </button>
        <button
          onClick={() => onSetQuantity(entry.libraryCardId, 0)}
          title="Remove from library"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-950/30 text-xs ml-1"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function AddPanel({
  ownedByCardId,
  onAdd,
}: {
  ownedByCardId: Map<string, number>;
  onAdd: (card: CardData) => void;
}) {
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [results, setResults] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "30" });
      if (query) params.set("q", query);
      if (colors.length > 0) params.set("colors", colors.join(","));
      const res = await fetch(`/api/cards?${params}`);
      if (res.ok) setResults(await res.json());
      setLoading(false);
    }, 250);
  }, [query, colors]);

  function toggleColor(c: string) {
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 space-y-2 border-b border-border flex-shrink-0">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards…"
          className="h-8 text-sm"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          {Object.keys(COLOR_LABELS).map((c) => {
            const active = colors.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleColor(c)}
                title={COLOR_LABELS[c]}
                className={`w-6 h-6 rounded-full border-2 font-bold text-[10px] transition-all ${COLOR_STYLE[c]} ${
                  active ? "scale-110 ring-2 ring-offset-1 ring-offset-background ring-white/30" : "opacity-40"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && results.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">Loading…</div>
        )}
        {!loading && results.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">No results</div>
        )}
        {results.map((card) => {
          const owned = ownedByCardId.get(card.cardId) ?? 0;
          return (
            <div
              key={card.cardId}
              className="flex items-center gap-2 px-3 py-2 border-b border-border/50 hover:bg-muted/40"
            >
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt={card.name} className="w-8 rounded flex-shrink-0" loading="lazy" />
              ) : (
                <div className="w-8 h-11 rounded bg-muted flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{card.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {card.manaCost && <span className="font-mono mr-1">{card.manaCost}</span>}
                  {card.typeLine}
                </div>
              </div>

              {owned > 0 && (
                <span
                  title="In your library"
                  className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400"
                >
                  ✓{owned}
                </span>
              )}

              <button
                onClick={() => onAdd(card)}
                title={owned > 0 ? "Add another copy" : "Add to library"}
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-colors bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground"
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
