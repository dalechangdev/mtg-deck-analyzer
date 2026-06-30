"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { CATEGORY_ORDER, getCardCategory, isBasicLand } from "@/lib/commander";
import type { CardData, DeckEntry } from "@/lib/commander";

export type LibraryCard = CardData & {
  libraryCardId: string;
  quantity: number;
};

interface Props {
  deckId: string;
  deckName: string;
  themes: { id: string; name: string }[];
  maybeboardName: string;
  initialEntries: DeckEntry[];
  libraryCards: LibraryCard[];
}

export function BuilderView({ deckId, deckName, themes, maybeboardName, initialEntries, libraryCards }: Props) {
  const [entries, setEntries] = useState<DeckEntry[]>(initialEntries);
  const [libFilter, setLibFilter] = useState("");

  const commander = entries.find((e) => e.isCommander);
  const mainCards = entries.filter((e) => !e.isCommander && e.slot === "main");
  const maybeCards = entries.filter((e) => e.slot === "maybe");

  // Set of cardIds currently in the deck (either slot) for quick lookup
  const inDeckByCardId = useMemo(() => {
    const m = new Map<string, { slot: "main" | "maybe" | "wishlist"; deckCardId: string }>();
    for (const e of entries) {
      if (!e.isCommander) m.set(e.cardId, { slot: e.slot, deckCardId: e.deckCardId });
    }
    return m;
  }, [entries]);

  const filteredLibrary = useMemo(() => {
    if (!libFilter.trim()) return libraryCards;
    const q = libFilter.toLowerCase();
    return libraryCards.filter((c) => c.name.toLowerCase().includes(q));
  }, [libraryCards, libFilter]);

  // Group main deck cards by type category
  const grouped = useMemo(() =>
    CATEGORY_ORDER.reduce<Record<string, DeckEntry[]>>((acc, cat) => {
      acc[cat] = mainCards
        .filter((e) => getCardCategory(e.typeLine) === cat)
        .sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name));
      return acc;
    }, {} as Record<string, DeckEntry[]>),
    [mainCards]
  );

  const mainCount = mainCards.reduce((s, e) => s + e.quantity, 0) + (commander ? 1 : 0);

  // --- Move card between slots ---
  const moveCard = useCallback(async (deckCardId: string, slot: "main" | "maybe") => {
    setEntries((prev) => prev.map((e) => e.deckCardId === deckCardId ? { ...e, slot } : e));
    await fetch(`/api/decks/${deckId}/cards/${deckCardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot }),
    });
  }, [deckId]);

  // --- Remove card from deck ---
  const removeCard = useCallback(async (deckCardId: string) => {
    const entry = entries.find((e) => e.deckCardId === deckCardId);
    if (entry && isBasicLand(entry.typeLine) && entry.quantity > 1) {
      setEntries((prev) => prev.map((e) => e.deckCardId === deckCardId ? { ...e, quantity: e.quantity - 1 } : e));
    } else {
      setEntries((prev) => prev.filter((e) => e.deckCardId !== deckCardId));
    }
    await fetch(`/api/decks/${deckId}/cards/${deckCardId}`, { method: "DELETE" });
  }, [deckId, entries]);

  // --- Add library card to deck ---
  const addFromLibrary = useCallback(async (card: LibraryCard, slot: "main" | "maybe") => {
    const existing = inDeckByCardId.get(card.cardId);
    if (existing) {
      // Already in deck — move to target slot if different
      if (existing.slot !== slot) moveCard(existing.deckCardId, slot);
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic: DeckEntry = {
      ...card,
      deckCardId: tempId,
      isCommander: false,
      quantity: 1,
      slot,
      ownedQuantity: card.quantity,
    };
    setEntries((prev) => [...prev, optimistic]);

    const res = await fetch(`/api/decks/${deckId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.cardId, slot }),
    });

    if (!res.ok) {
      setEntries((prev) => prev.filter((e) => e.deckCardId !== tempId));
      return;
    }

    const { id: realId } = await res.json();
    setEntries((prev) => prev.map((e) => e.deckCardId === tempId ? { ...e, deckCardId: realId } : e));
  }, [deckId, inDeckByCardId, moveCard]);

  return (
    <div className="flex flex-col h-[calc(100vh-49px)]">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">{deckName}</span>
          {commander && (
            <span className="text-xs text-muted-foreground">{commander.name}</span>
          )}
          <span className="text-xs font-mono text-muted-foreground ml-auto">
            {mainCount} / 100
          </span>
          <Link
            href={`/decks/${deckId}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Full builder
          </Link>
        </div>
        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {themes.map((t) => (
              <span
                key={t.id}
                className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground"
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Body: main content + right card column */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Main content area */}
        <div className="flex-1 min-w-0" />

        {/* ── Right column: three stacked card lists ── */}
        <div className="w-72 flex-shrink-0 flex flex-col border-l border-border overflow-hidden">

          {/* Main Deck — 1/3 */}
          <div className="flex-1 flex flex-col overflow-hidden border-b border-border">
            <div className="px-3 py-1.5 bg-muted/30 border-b border-border flex-shrink-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Main Deck ({mainCount})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {commander && (
                <section className="border-b border-border">
                  <SectionHeader label="Commander" count={1} />
                  <MainRow entry={commander} onRemove={removeCard} onMove={moveCard} isCommander />
                </section>
              )}
              {CATEGORY_ORDER.map((cat) => {
                const cards = grouped[cat];
                if (!cards?.length) return null;
                return (
                  <section key={cat} className="border-b border-border">
                    <SectionHeader label={cat} count={cards.reduce((s, e) => s + e.quantity, 0)} />
                    {cards.map((entry) => (
                      <MainRow key={entry.deckCardId} entry={entry} onRemove={removeCard} onMove={moveCard} />
                    ))}
                  </section>
                );
              })}
              {mainCards.length === 0 && !commander && (
                <p className="px-3 py-4 text-xs text-muted-foreground">No cards in main deck.</p>
              )}
            </div>
          </div>

          {/* Maybeboard — 1/3 */}
          <div className="flex-1 flex flex-col overflow-hidden border-b border-border">
            <div className="px-3 py-1.5 bg-amber-950/20 border-b border-amber-900/30 flex-shrink-0">
              <span className="text-[11px] font-semibold text-amber-500/80 uppercase tracking-wider">
                {maybeboardName || "Maybeboard"} ({maybeCards.length})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {maybeCards.map((entry) => (
                <MaybeRow key={entry.deckCardId} entry={entry} onRemove={removeCard} onMove={moveCard} />
              ))}
              {maybeCards.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground">No maybeboard cards.</p>
              )}
            </div>
          </div>

          {/* Library — 1/3 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 bg-muted/30 border-b border-border flex-shrink-0 space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Library ({filteredLibrary.length}{libFilter ? ` of ${libraryCards.length}` : ""})
              </span>
              <input
                value={libFilter}
                onChange={(e) => setLibFilter(e.target.value)}
                placeholder="Filter cards…"
                className="w-full text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredLibrary.map((card) => {
                const inDeck = inDeckByCardId.get(card.cardId);
                return (
                  <LibraryRow
                    key={card.cardId}
                    card={card}
                    inDeck={inDeck}
                    onAdd={addFromLibrary}
                  />
                );
              })}
              {filteredLibrary.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground">No matching cards.</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 sticky top-0">
      {label} ({count})
    </div>
  );
}

function MainRow({
  entry,
  onRemove,
  onMove,
  isCommander = false,
}: {
  entry: DeckEntry;
  onRemove: (id: string) => void;
  onMove: (id: string, slot: "main" | "maybe") => void;
  isCommander?: boolean;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
      <div className="flex-1 min-w-0">
        <span className="text-xs truncate block">
          {entry.quantity > 1 && (
            <span className="text-muted-foreground mr-1">{entry.quantity}×</span>
          )}
          {entry.name}
        </span>
        {entry.manaCost && (
          <span className="text-[11px] text-muted-foreground font-mono">{entry.manaCost}</span>
        )}
      </div>
      {!isCommander && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onMove(entry.deckCardId, "maybe")}
            title="Move to maybeboard"
            className="text-[10px] px-1.5 py-0.5 rounded border border-amber-600/50 text-amber-400 hover:bg-amber-950/40"
          >
            → maybe
          </button>
          <button
            onClick={() => onRemove(entry.deckCardId)}
            title="Remove"
            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-950/30 text-xs"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function MaybeRow({
  entry,
  onRemove,
  onMove,
}: {
  entry: DeckEntry;
  onRemove: (id: string) => void;
  onMove: (id: string, slot: "main" | "maybe") => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-amber-950/10">
      <div className="flex-1 min-w-0">
        <span className="text-xs truncate block text-amber-400/80">
          {entry.name}
        </span>
        {entry.manaCost && (
          <span className="text-[11px] text-muted-foreground font-mono">{entry.manaCost}</span>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onMove(entry.deckCardId, "main")}
          title="Move to main deck"
          className="text-[10px] px-1.5 py-0.5 rounded border border-green-600/50 text-green-400 hover:bg-green-950/40"
        >
          → main
        </button>
        <button
          onClick={() => onRemove(entry.deckCardId)}
          title="Remove"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-950/30 text-xs"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function LibraryRow({
  card,
  inDeck,
  onAdd,
}: {
  card: LibraryCard;
  inDeck: { slot: "main" | "maybe" | "wishlist"; deckCardId: string } | undefined;
  onAdd: (card: LibraryCard, slot: "main" | "maybe") => void;
}) {
  const badge = inDeck
    ? inDeck.slot === "main"
      ? { label: "in deck", cls: "text-green-400 bg-green-950/30" }
      : { label: "maybe", cls: "text-amber-400 bg-amber-950/30" }
    : null;

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs truncate">{card.name}</span>
          {badge && (
            <span className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {card.manaCost && (
            <span className="text-[11px] text-muted-foreground font-mono">{card.manaCost}</span>
          )}
          <span className="text-[11px] text-muted-foreground">×{card.quantity}</span>
        </div>
      </div>
      {!inDeck && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAdd(card, "main")}
            title="Add to main deck"
            className="text-[10px] px-1.5 py-0.5 rounded border border-green-600/50 text-green-400 hover:bg-green-950/40"
          >
            + main
          </button>
          <button
            onClick={() => onAdd(card, "maybe")}
            title="Add to maybeboard"
            className="text-[10px] px-1.5 py-0.5 rounded border border-amber-600/50 text-amber-400 hover:bg-amber-950/40"
          >
            + maybe
          </button>
        </div>
      )}
      {inDeck && inDeck.slot === "maybe" && (
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAdd(card, "main")}
            title="Promote to main deck"
            className="text-[10px] px-1.5 py-0.5 rounded border border-green-600/50 text-green-400 hover:bg-green-950/40"
          >
            → main
          </button>
        </div>
      )}
    </div>
  );
}
