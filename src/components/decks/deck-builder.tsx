"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchPanel } from "./search-panel";
import { DeckPanel } from "./deck-panel";
import { Input } from "@/components/ui/input";
import { validateDeck, isBasicLand } from "@/lib/commander";
import type { CardData, DeckEntry } from "@/lib/commander";

interface Props {
  deckId: string;
  initialName: string;
  initialEntries: DeckEntry[];
}

export function DeckBuilder({ deckId, initialName, initialEntries }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [entries, setEntries] = useState<DeckEntry[]>(initialEntries);
  const [savingName, setSavingName] = useState(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commander = entries.find((e) => e.isCommander);
  const validation = validateDeck(entries);
  const isValid =
    validation.cardCount === 100 &&
    validation.commanderSet &&
    validation.colorViolations.length === 0 &&
    validation.duplicates.length === 0;

  // --- Name save (debounced) ---
  function handleNameChange(val: string) {
    setName(val);
    clearTimeout(nameDebounceRef.current ?? undefined);
    nameDebounceRef.current = setTimeout(async () => {
      setSavingName(true);
      await fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: val }),
      });
      setSavingName(false);
    }, 800);
  }

  // --- Add card ---
  const addCard = useCallback(
    async (card: CardData) => {
      const existing = entries.find((e) => e.cardId === card.cardId);
      if (isBasicLand(card.typeLine) && existing) {
        setEntries((prev) =>
          prev.map((e) => (e.cardId === card.cardId ? { ...e, quantity: e.quantity + 1 } : e))
        );
        const res = await fetch(`/api/decks/${deckId}/cards`, {
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
      const optimistic: DeckEntry = { ...card, deckCardId: tempId, isCommander: false, quantity: 1 };
      setEntries((prev) => [...prev, optimistic]);

      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId }),
      });

      if (!res.ok) {
        setEntries((prev) => prev.filter((e) => e.deckCardId !== tempId));
        return;
      }

      const { id: realId } = await res.json();
      setEntries((prev) =>
        prev.map((e) => (e.deckCardId === tempId ? { ...e, deckCardId: realId } : e))
      );
    },
    [deckId, entries]
  );

  // --- Remove card ---
  const removeCard = useCallback(
    async (deckCardId: string) => {
      const entry = entries.find((e) => e.deckCardId === deckCardId);
      if (entry && isBasicLand(entry.typeLine) && entry.quantity > 1) {
        setEntries((prev) =>
          prev.map((e) => (e.deckCardId === deckCardId ? { ...e, quantity: e.quantity - 1 } : e))
        );
      } else {
        setEntries((prev) => prev.filter((e) => e.deckCardId !== deckCardId));
      }
      await fetch(`/api/decks/${deckId}/cards/${deckCardId}`, { method: "DELETE" });
    },
    [deckId, entries]
  );

  // --- Set commander ---
  const setCommander = useCallback(
    async (deckCardId: string) => {
      // Optimistic: demote existing commander, promote this card
      setEntries((prev) =>
        prev.map((e) => ({ ...e, isCommander: e.deckCardId === deckCardId }))
      );

      const entry = entries.find((e) => e.deckCardId === deckCardId);
      if (!entry) return;

      // Remove and re-add as commander
      await fetch(`/api/decks/${deckId}/cards/${deckCardId}`, { method: "DELETE" });
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: entry.cardId, isCommander: true }),
      });

      if (res.ok) {
        const { id: newId } = await res.json();
        setEntries((prev) =>
          prev.map((e) => (e.deckCardId === deckCardId ? { ...e, deckCardId: newId } : e))
        );
      }
    },
    [deckId, entries]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-49px)]">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border flex-shrink-0">
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="h-8 text-sm font-medium max-w-64 border-transparent hover:border-input focus:border-input bg-transparent"
        />

        {/* Commander pill */}
        {commander ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {commander.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={commander.imageUrl} alt={commander.name} className="w-6 rounded" />
            )}
            <span className="text-xs">{commander.name}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No commander</span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {savingName && <span className="text-xs text-muted-foreground">Saving…</span>}

          {/* Card count */}
          <span
            className={`text-sm font-mono font-medium ${
              validation.cardCount === 100 ? "text-green-400" : "text-muted-foreground"
            }`}
          >
            {validation.cardCount} / 100
          </span>

          {/* Validity badge */}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isValid
                ? "bg-green-900/40 text-green-400"
                : "bg-amber-900/40 text-amber-400"
            }`}
          >
            {isValid ? "Valid" : "Incomplete"}
          </span>

          <button
            onClick={() => router.push("/decks")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Decks
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: search */}
        <div className="w-72 flex-shrink-0 border-r border-border overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Add Cards
          </div>
          <SearchPanel
            commanderColorIdentity={commander?.colorIdentity ?? []}
            entries={entries}
            onAdd={addCard}
          />
        </div>

        {/* Right: deck list */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Deck ({entries.length} cards)
          </div>
          <DeckPanel
            entries={entries}
            onRemove={removeCard}
            onSetCommander={setCommander}
          />
        </div>
      </div>
    </div>
  );
}
