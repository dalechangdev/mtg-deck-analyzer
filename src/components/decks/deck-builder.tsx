"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SearchPanel } from "./search-panel";
import { DeckPanel } from "./deck-panel";
import { CardAnnotationModal } from "./card-annotation-modal";
import { DeckThemeSelect } from "./deck-theme-select";
import { Toaster } from "@/components/ui/toaster";
import { toastManager } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { validateDeck, isBasicLand, isManaRamp } from "@/lib/commander";
import { extractThemes } from "@/lib/synergy";
import { ManaCurve } from "./mana-curve";
import { CurveProbability } from "./curve-probability";
import type { CardData, DeckEntry } from "@/lib/commander";
import type { SynergyTheme } from "@/lib/synergy";

interface Props {
  deckId: string;
  initialName: string;
  initialEntries: DeckEntry[];
  initialDescription: string;
  initialThemeIds: string[];
  allThemes: { id: string; name: string }[];
  initialMaybeboardName: string;
  initialWishlistName: string;
}

export function DeckBuilder({
  deckId,
  initialName,
  initialEntries,
  initialDescription,
  initialThemeIds,
  allThemes,
  initialMaybeboardName,
  initialWishlistName,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [entries, setEntries] = useState<DeckEntry[]>(initialEntries);
  const [description, setDescription] = useState(initialDescription);
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>(initialThemeIds ?? []);
  const [maybeboardName, setMaybeboardName] = useState(initialMaybeboardName);
  const [wishlistName, setWishlistName] = useState(initialWishlistName);
  const [annotatingCard, setAnnotatingCard] = useState<{ cardId: string; cardName: string; imageUrl: string | null } | null>(null);
  const [showStrategy, setShowStrategy] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maybeNameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wishlistNameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commander = entries.find((e) => e.isCommander);
  const validation = validateDeck(entries);
  const isValid =
    validation.cardCount === 100 &&
    validation.commanderSet &&
    validation.colorViolations.length === 0 &&
    validation.duplicates.length === 0;

  const rampCount = useMemo(
    () =>
      entries
        .filter((e) => e.slot === "main" && !e.isCommander && isManaRamp(e))
        .reduce((sum, e) => sum + e.quantity, 0),
    [entries]
  );

  // Ownership tally over the main deck — drives the "what would it cost to build" summary
  const ownership = useMemo(() => {
    const mainEntries = entries.filter((e) => e.slot === "main");
    const needed: DeckEntry[] = [];
    let owned = 0;
    for (const e of mainEntries) {
      if ((e.ownedQuantity ?? 0) >= e.quantity) owned++;
      else needed.push(e);
    }
    return { total: mainEntries.length, owned, needed };
  }, [entries]);

  const commanderThemes = useMemo<Set<SynergyTheme>>(() => {
    if (!commander) return new Set();
    return extractThemes(commander.oracleText, commander.keywords);
  }, [commander]);

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

  // --- Description save (debounced) ---
  function handleDescriptionChange(val: string) {
    setDescription(val);
    clearTimeout(descDebounceRef.current ?? undefined);
    descDebounceRef.current = setTimeout(() => {
      fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: val }),
      });
    }, 800);
  }

  // --- Maybeboard name save (debounced) ---
  function handleMaybeboardNameChange(val: string) {
    setMaybeboardName(val);
    clearTimeout(maybeNameDebounceRef.current ?? undefined);
    maybeNameDebounceRef.current = setTimeout(() => {
      fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maybeboardName: val || null }),
      });
    }, 800);
  }

  // --- Wishlist name save (debounced) ---
  function handleWishlistNameChange(val: string) {
    setWishlistName(val);
    clearTimeout(wishlistNameDebounceRef.current ?? undefined);
    wishlistNameDebounceRef.current = setTimeout(() => {
      fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wishlistName: val || null }),
      });
    }, 800);
  }

  // --- Themes ---
  async function toggleTheme(id: string, selected: boolean) {
    const prev = selectedThemeIds;
    const next = selected
      ? [...prev, id]
      : prev.filter((t) => t !== id);
    setSelectedThemeIds(next);
    const res = await fetch(`/api/decks/${deckId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeIds: next }),
    });
    if (!res.ok) {
      setSelectedThemeIds(prev);
      toastManager.add({ title: "Failed to update themes", description: "Your change was not saved.", timeout: 4000 });
    }
  }

  // --- Add card ---
  const addCard = useCallback(
    async (card: CardData, slot: "main" | "maybe" | "wishlist" = "main") => {
      const existing = entries.find((e) => e.cardId === card.cardId);
      if (isBasicLand(card.typeLine) && existing) {
        setEntries((prev) =>
          prev.map((e) => (e.cardId === card.cardId ? { ...e, quantity: e.quantity + 1 } : e))
        );
        const res = await fetch(`/api/decks/${deckId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: card.cardId, slot }),
        });
        if (!res.ok) {
          setEntries((prev) =>
            prev.map((e) => (e.cardId === card.cardId ? { ...e, quantity: e.quantity - 1 } : e))
          );
        }
        return;
      }

      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const optimistic: DeckEntry = {
        ...card,
        deckCardId: tempId,
        isCommander: false,
        quantity: 1,
        slot,
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

  // --- Move card between slots ---
  const moveCard = useCallback(
    async (deckCardId: string, slot: "main" | "maybe" | "wishlist") => {
      setEntries((prev) =>
        prev.map((e) => (e.deckCardId === deckCardId ? { ...e, slot } : e))
      );
      await fetch(`/api/decks/${deckId}/cards/${deckCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
    },
    [deckId]
  );

  // --- Set commander ---
  const setCommander = useCallback(
    async (deckCardId: string) => {
      setEntries((prev) =>
        prev.map((e) => ({ ...e, isCommander: e.deckCardId === deckCardId }))
      );

      const entry = entries.find((e) => e.deckCardId === deckCardId);
      if (!entry) return;

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
      <Toaster />
      {annotatingCard && (
        <CardAnnotationModal
          deckId={deckId}
          cardId={annotatingCard.cardId}
          cardName={annotatingCard.cardName}
          imageUrl={annotatingCard.imageUrl}
          onClose={() => setAnnotatingCard(null)}
        />
      )}
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-border flex-shrink-0">
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="h-8 text-sm font-medium max-w-64 border-transparent hover:border-input focus:border-input bg-transparent"
        />

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

          <button
            onClick={() => setShowStrategy((v) => !v)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              showStrategy
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Strategy
          </button>

          <Link
            href={`/decks/${deckId}/builder`}
            className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Deck Builder
          </Link>

          {ownership.total > 0 && (
            <span
              title={`You own ${ownership.owned} of ${ownership.total} main-deck cards`}
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                ownership.needed.length === 0
                  ? "bg-emerald-900/40 text-emerald-400"
                  : "bg-muted/60 text-muted-foreground"
              }`}
            >
              {ownership.needed.length === 0
                ? "All owned"
                : `Owned ${ownership.owned} · Need ${ownership.needed.length}`}
            </span>
          )}

          <span
            className={`text-sm font-mono font-medium ${
              validation.cardCount === 100 ? "text-green-400" : "text-muted-foreground"
            }`}
          >
            {validation.cardCount} / 100
          </span>

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

      {/* Themes row */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border flex-shrink-0">
        <DeckThemeSelect
          allThemes={allThemes}
          selectedIds={selectedThemeIds}
          onToggle={toggleTheme}
        />
      </div>

      {/* Strategy panel */}
      {showStrategy && (
        <div className="px-4 py-3 border-b border-border bg-muted/20 flex-shrink-0 space-y-3">
          <ManaCurve entries={entries} />
          <CurveProbability entries={entries} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Mana Ramp
            </span>
            <span className="text-[11px] text-muted-foreground">
              <span className="text-foreground font-medium">{rampCount}</span>{" "}
              card{rampCount !== 1 ? "s" : ""}
            </span>
          </div>
          {ownership.total > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Ownership
                </span>
                <span className="text-[11px] text-muted-foreground">
                  <span className="text-emerald-400 font-medium">{ownership.owned}</span> owned ·{" "}
                  <span className="text-foreground font-medium">{ownership.needed.length}</span> needed
                </span>
              </div>
              {ownership.needed.length === 0 ? (
                <p className="text-[11px] text-emerald-400">
                  You own every card in the main deck — free to build.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {ownership.needed
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((e) => (
                      <span
                        key={e.deckCardId}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground"
                      >
                        {e.name}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Objectives
            </div>
            <textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Describe your deck's win conditions and play style…"
              rows={3}
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 flex-shrink-0 border-r border-border overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Add Cards
          </div>
          <SearchPanel
            commanderColorIdentity={commander?.colorIdentity ?? []}
            commanderThemes={commanderThemes}
            entries={entries}
            onAdd={addCard}
          />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Deck ({entries.filter((e) => e.slot === "main").reduce((s, e) => s + e.quantity, 0)} main
            {entries.some((e) => e.slot === "maybe") &&
              ` · ${entries.filter((e) => e.slot === "maybe").reduce((s, e) => s + e.quantity, 0)} maybe`}
            {entries.some((e) => e.slot === "wishlist") &&
              ` · ${entries.filter((e) => e.slot === "wishlist").reduce((s, e) => s + e.quantity, 0)} wishlist`}
            )
          </div>
          <DeckPanel
            deckId={deckId}
            entries={entries}
            onRemove={removeCard}
            onSetCommander={setCommander}
            onMoveCard={moveCard}
            onAnnotate={(cardId, cardName, imageUrl) => setAnnotatingCard({ cardId, cardName, imageUrl })}
            maybeboardName={maybeboardName}
            onMaybeboardNameChange={handleMaybeboardNameChange}
            wishlistName={wishlistName}
            onWishlistNameChange={handleWishlistNameChange}
          />
        </div>
      </div>
    </div>
  );
}
