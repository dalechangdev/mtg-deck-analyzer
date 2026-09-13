"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { CATEGORY_ORDER, getCardCategory, isBasicLand } from "@/lib/commander";
import type { CardData, DeckEntry } from "@/lib/commander";
import { FullHeightView } from "@/components/ui/shell";
import { SectionHeader, SectionLabel } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { versionCardsUrl } from "@/lib/deck-api";

export type LibraryCard = CardData & {
  libraryCardId: string;
  quantity: number;
};

interface Props {
  deckId: string;
  versionId: string;
  deckName: string;
  themes: { id: string; name: string }[];
  maybeboardName: string;
  initialEntries: DeckEntry[];
  libraryCards: LibraryCard[];
}

export function BuilderView({ deckId, versionId, deckName, themes, maybeboardName, initialEntries, libraryCards }: Props) {
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
    await fetch(versionCardsUrl(deckId, versionId, deckCardId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot }),
    });
  }, [deckId, versionId]);

  // --- Remove card from deck ---
  const removeCard = useCallback(async (deckCardId: string) => {
    const entry = entries.find((e) => e.deckCardId === deckCardId);
    if (entry && isBasicLand(entry.typeLine) && entry.quantity > 1) {
      setEntries((prev) => prev.map((e) => e.deckCardId === deckCardId ? { ...e, quantity: e.quantity - 1 } : e));
    } else {
      setEntries((prev) => prev.filter((e) => e.deckCardId !== deckCardId));
    }
    await fetch(versionCardsUrl(deckId, versionId, deckCardId), { method: "DELETE" });
  }, [deckId, versionId, entries]);

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

    const res = await fetch(versionCardsUrl(deckId, versionId), {
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
  }, [deckId, versionId, inDeckByCardId, moveCard]);

  return (
    <FullHeightView>
      {/* Header */}
      <div className="px-4 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-ui font-medium">{deckName}</span>
          {commander && (
            <span className="text-body text-muted-foreground">{commander.name}</span>
          )}
          <span className="text-body font-mono text-muted-foreground ml-auto">
            {mainCount} / 100
          </span>
          <Link
            href={`/decks/${deckId}`}
            className="text-body text-muted-foreground hover:text-foreground"
          >
            ← Full builder
          </Link>
        </div>
        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {themes.map((t) => (
              <span
                key={t.id}
                className="text-label px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground"
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
              <SectionLabel>
                Main Deck ({mainCount})
              </SectionLabel>
            </div>
            <div className="flex-1 overflow-y-auto">
              {commander && (
                <section className="border-b border-border">
                  <CategoryHeader label="Commander" count={1} />
                  <MainRow entry={commander} onRemove={removeCard} onMove={moveCard} isCommander />
                </section>
              )}
              {CATEGORY_ORDER.map((cat) => {
                const cards = grouped[cat];
                if (!cards?.length) return null;
                return (
                  <section key={cat} className="border-b border-border">
                    <CategoryHeader label={cat} count={cards.reduce((s, e) => s + e.quantity, 0)} />
                    {cards.map((entry) => (
                      <MainRow key={entry.deckCardId} entry={entry} onRemove={removeCard} onMove={moveCard} />
                    ))}
                  </section>
                );
              })}
              {mainCards.length === 0 && !commander && (
                <p className="px-3 py-4 text-body text-muted-foreground">No cards in main deck.</p>
              )}
            </div>
          </div>

          {/* Maybeboard — 1/3 */}
          <div className="flex-1 flex flex-col overflow-hidden border-b border-border">
            <div className="px-3 py-1.5 bg-warning-surface border-b border-warning-line flex-shrink-0">
              <SectionLabel tone="inherit" className="text-warning/80">
                {maybeboardName || "Potential"} ({maybeCards.length})
              </SectionLabel>
            </div>
            <div className="flex-1 overflow-y-auto">
              {maybeCards.map((entry) => (
                <MaybeRow key={entry.deckCardId} entry={entry} onRemove={removeCard} onMove={moveCard} />
              ))}
              {maybeCards.length === 0 && (
                <p className="px-3 py-4 text-body text-muted-foreground">No potential cards.</p>
              )}
            </div>
          </div>

          {/* Library — 1/3 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 bg-muted/30 border-b border-border flex-shrink-0 space-y-1.5">
              <SectionLabel className="block">
                Library ({filteredLibrary.length}{libFilter ? ` of ${libraryCards.length}` : ""})
              </SectionLabel>
              <input
                value={libFilter}
                onChange={(e) => setLibFilter(e.target.value)}
                placeholder="Filter cards…"
                className="w-full text-body bg-background border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
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
                <p className="px-3 py-4 text-body text-muted-foreground">No matching cards.</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </FullHeightView>
  );
}

/** Sticky "CATEGORY (n)" heading used by the main-deck list. */
function CategoryHeader({ label, count }: { label: string; count: number }) {
  return (
    <SectionHeader sticky>
      {label} ({count})
    </SectionHeader>
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
        <span className="text-body truncate block">
          {entry.quantity > 1 && (
            <span className="text-muted-foreground mr-1">{entry.quantity}×</span>
          )}
          {entry.name}
        </span>
        {entry.manaCost && (
          <span className="text-label text-muted-foreground font-mono">{entry.manaCost}</span>
        )}
      </div>
      {!isCommander && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onMove(entry.deckCardId, "maybe")}
            title="Move to potential"
            className="text-micro px-1.5 py-0.5 rounded-md border border-warning-border text-warning hover:bg-warning-surface-strong"
          >
            → potential
          </button>
          <Button
            onClick={() => onRemove(entry.deckCardId)}
            title="Remove"
            variant="ghost" size="icon-xs" className="size-5 text-body text-muted-foreground hover:text-danger hover:bg-danger-surface"
          >
            ×
          </Button>
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
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-warning-surface">
      <div className="flex-1 min-w-0">
        <span className="text-body truncate block text-warning/80">
          {entry.name}
        </span>
        {entry.manaCost && (
          <span className="text-label text-muted-foreground font-mono">{entry.manaCost}</span>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onMove(entry.deckCardId, "main")}
          title="Move to main deck"
          className="text-micro px-1.5 py-0.5 rounded-md border border-success-border text-success hover:bg-success-surface-strong"
        >
          → main
        </button>
        <Button
          onClick={() => onRemove(entry.deckCardId)}
          title="Remove"
          variant="ghost" size="icon-xs" className="size-5 text-body text-muted-foreground hover:text-danger hover:bg-danger-surface"
        >
          ×
        </Button>
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
      ? { label: "in deck", cls: "text-success bg-success-surface" }
      : { label: "maybe", cls: "text-warning bg-warning-surface" }
    : null;

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-body truncate">{card.name}</span>
          {badge && (
            <span className={`text-micro px-1 py-0.5 rounded-md flex-shrink-0 ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {card.manaCost && (
            <span className="text-label text-muted-foreground font-mono">{card.manaCost}</span>
          )}
          <span className="text-label text-muted-foreground">×{card.quantity}</span>
        </div>
      </div>
      {!inDeck && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAdd(card, "main")}
            title="Add to main deck"
            className="text-micro px-1.5 py-0.5 rounded-md border border-success-border text-success hover:bg-success-surface-strong"
          >
            + main
          </button>
          <button
            onClick={() => onAdd(card, "maybe")}
            title="Add to potential"
            className="text-micro px-1.5 py-0.5 rounded-md border border-warning-border text-warning hover:bg-warning-surface-strong"
          >
            + potential
          </button>
        </div>
      )}
      {inDeck && inDeck.slot === "maybe" && (
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAdd(card, "main")}
            title="Promote to main deck"
            className="text-micro px-1.5 py-0.5 rounded-md border border-success-border text-success hover:bg-success-surface-strong"
          >
            → main
          </button>
        </div>
      )}
    </div>
  );
}
