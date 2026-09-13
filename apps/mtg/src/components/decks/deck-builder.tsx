"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SearchPanel } from "./search-panel";
import { DeckPanel } from "./deck-panel";
import { DeckSummary } from "./deck-summary";
import { DeckSteps } from "./deck-steps";
import { CardAnnotationModal } from "./card-annotation-modal";
import { DeckThemeSelect } from "./deck-theme-select";
import { Toaster } from "@/components/ui/toaster";
import { toastManager } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { deckPageUrl, versionCardsUrl, type VersionSummary } from "@/lib/deck-api";
import { VersionSwitcher } from "./version-switcher";
import { validateDeck, isBasicLand, isManaRamp } from "@/lib/commander";
import { extractThemes } from "@/lib/synergy";
import { ManaCurve } from "./mana-curve";
import { CurveProbability } from "./curve-probability";
import { BoardClearCount } from "./board-clear-count";
import type { CardData, DeckEntry } from "@/lib/commander";
import type { SynergyTheme } from "@/lib/synergy";
import { FullHeightView } from "@/components/ui/shell";
import { SectionHeader, SectionLabel } from "@/components/ui/section-header";
import { Textarea } from "@/components/ui/textarea";

/** Collapsed width of the deck dock, and the matching gutter the search reserves
 *  for it so the rail never covers a result. Keep the two in sync. */
const DOCK_RAIL_WIDTH = "w-56";
const DOCK_RAIL_OFFSET = "pr-56";

interface Props {
  deckId: string;
  /** The version whose cards are being edited. Deck-level fields (name, themes, notes) are shared. */
  versionId: string;
  /** Every version of the deck, for the switcher. */
  versions: VersionSummary[];
  initialName: string;
  initialEntries: DeckEntry[];
  initialDescription: string;
  initialThemeIds: string[];
  allThemes: { id: string; name: string }[];
  initialMaybeboardName: string;
  initialWishlistName: string;
  /** Step the URL asked for; otherwise the deck's own progress decides. */
  initialStep?: "commander" | "potential";
}

export function DeckBuilder({
  deckId,
  versionId,
  versions,
  initialName,
  initialEntries,
  initialDescription,
  initialThemeIds,
  allThemes,
  initialMaybeboardName,
  initialWishlistName,
  initialStep,
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
  const [deckOpen, setDeckOpen] = useState(false);
  const [step, setStep] = useState<"commander" | "potential">(
    initialStep ?? (initialEntries.some((e) => e.isCommander) ? "potential" : "commander")
  );
  const [savingName, setSavingName] = useState(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maybeNameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wishlistNameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commander = entries.find((e) => e.isCommander);
  const validation = validateDeck(entries);
  const hasSacrificeTheme = selectedThemeIds.some(
    (id) => id === "sacrifice" || id === "aristocrats"
  );
  const isValid =
    validation.cardCount === 100 &&
    validation.commanderSet &&
    validation.colorViolations.length === 0 &&
    validation.duplicates.length === 0;

  const slotCounts = useMemo(() => {
    const sum = (slot: DeckEntry["slot"]) =>
      entries.filter((e) => e.slot === slot).reduce((s, e) => s + e.quantity, 0);
    return { main: sum("main"), maybe: sum("maybe"), wishlist: sum("wishlist") };
  }, [entries]);
  const { main: mainCount, maybe: maybeCount, wishlist: wishlistCount } = slotCounts;

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
    async (card: CardData, slot: "main" | "maybe" | "wishlist" = "maybe") => {
      const existing = entries.find((e) => e.cardId === card.cardId);
      if (isBasicLand(card.typeLine) && existing) {
        setEntries((prev) =>
          prev.map((e) => (e.cardId === card.cardId ? { ...e, quantity: e.quantity + 1 } : e))
        );
        const res = await fetch(versionCardsUrl(deckId, versionId), {
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
      setEntries((prev) =>
        prev.map((e) => (e.deckCardId === tempId ? { ...e, deckCardId: realId } : e))
      );
    },
    [deckId, versionId, entries]
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
      await fetch(versionCardsUrl(deckId, versionId, deckCardId), { method: "DELETE" });
    },
    [deckId, versionId, entries]
  );

  // --- Move card between slots ---
  const moveCard = useCallback(
    async (deckCardId: string, slot: "main" | "maybe" | "wishlist") => {
      setEntries((prev) =>
        prev.map((e) => (e.deckCardId === deckCardId ? { ...e, slot } : e))
      );
      await fetch(versionCardsUrl(deckId, versionId, deckCardId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
    },
    [deckId, versionId]
  );

  // --- Set commander, for a card already in the deck ---
  const setCommander = useCallback(
    async (deckCardId: string) => {
      const previous = entries;
      setEntries((prev) =>
        prev.map((e) =>
          e.deckCardId === deckCardId
            ? { ...e, isCommander: true, slot: "main" as const }
            : { ...e, isCommander: false }
        )
      );

      const res = await fetch(versionCardsUrl(deckId, versionId, deckCardId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCommander: true }),
      });

      if (!res.ok) {
        setEntries(previous);
        toastManager.add({
          title: "Failed to set commander",
          description: "Your change was not saved.",
          timeout: 4000,
        });
      }
    },
    [deckId, versionId, entries]
  );

  // --- Step 1: choose the commander from search, card need not be in the deck ---
  const chooseCommander = useCallback(
    async (card: CardData) => {
      const existing = entries.find((e) => e.cardId === card.cardId);
      if (existing) {
        await setCommander(existing.deckCardId);
        setStep("potential");
        return;
      }

      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const previous = entries;
      setEntries((prev) => [
        ...prev.map((e) => ({ ...e, isCommander: false })),
        { ...card, deckCardId: tempId, isCommander: true, quantity: 1, slot: "main" as const },
      ]);
      setStep("potential");

      const res = await fetch(versionCardsUrl(deckId, versionId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId, isCommander: true, slot: "main" }),
      });

      if (!res.ok) {
        setEntries(previous);
        toastManager.add({
          title: "Failed to set commander",
          description: "Your change was not saved.",
          timeout: 4000,
        });
        return;
      }

      const { id: realId } = await res.json();
      setEntries((prev) =>
        prev.map((e) => (e.deckCardId === tempId ? { ...e, deckCardId: realId } : e))
      );
    },
    [deckId, versionId, entries, setCommander]
  );

  return (
    <FullHeightView>
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
          className="h-8 text-ui font-medium max-w-64 border-transparent hover:border-input focus:border-input bg-transparent"
        />

        <VersionSwitcher deckId={deckId} versionId={versionId} versions={versions} />

        {commander ? (
          <div className="flex items-center gap-2 text-ui text-muted-foreground">
            {commander.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={commander.imageUrl} alt={commander.name} className="w-6 rounded-md" />
            )}
            <span className="text-body">{commander.name}</span>
          </div>
        ) : (
          <span className="text-body text-muted-foreground">No commander</span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {savingName && <span className="text-body text-muted-foreground">Saving…</span>}

          <button
            onClick={() => setShowStrategy((v) => !v)}
            className={`text-body px-2 py-0.5 rounded-md border transition-colors ${
              showStrategy
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Strategy
          </button>

          <Link
            href={deckPageUrl(deckId, versionId, "/builder")}
            className="text-body px-2 py-0.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Deck Builder
          </Link>

          {hasSacrificeTheme && (
            <Link
              href={deckPageUrl(deckId, versionId, "/builder/sacrifice")}
              className="text-body px-2 py-0.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Sacrifice
            </Link>
          )}

          {ownership.total > 0 && (
            <span
              title={`You own ${ownership.owned} of ${ownership.total} main-deck cards`}
              className={`text-body px-2 py-0.5 rounded-full font-medium ${
                ownership.needed.length === 0
                  ? "bg-success-surface-strong text-success"
                  : "bg-muted/60 text-muted-foreground"
              }`}
            >
              {ownership.needed.length === 0
                ? "All owned"
                : `Owned ${ownership.owned} · Need ${ownership.needed.length}`}
            </span>
          )}

          <span
            className={`text-ui font-mono font-medium ${
              validation.cardCount === 100 ? "text-success" : "text-muted-foreground"
            }`}
          >
            {validation.cardCount} / 100
          </span>

          <span
            className={`text-body px-2 py-0.5 rounded-full font-medium ${
              isValid
                ? "bg-success-surface-strong text-success"
                : "bg-warning-surface-strong text-warning"
            }`}
          >
            {isValid ? "Valid" : "Incomplete"}
          </span>

          <button
            onClick={() => router.push("/decks")}
            className="text-body text-muted-foreground hover:text-foreground"
          >
            ← Decks
          </button>
        </div>
      </div>

      {/* Build steps */}
      <DeckSteps
        deckId={deckId}
        versionId={versionId}
        current={step}
        commanderName={commander?.name ?? null}
        potentialCount={maybeCount}
        mainCount={validation.cardCount}
        onStep={setStep}
      />

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
            <SectionLabel>
              Mana Ramp
            </SectionLabel>
            <span className="text-label text-muted-foreground">
              <span className="text-foreground font-medium">{rampCount}</span>{" "}
              card{rampCount !== 1 ? "s" : ""}
            </span>
          </div>
          <BoardClearCount entries={entries} />
          {ownership.total > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <SectionLabel>
                  Ownership
                </SectionLabel>
                <span className="text-label text-muted-foreground">
                  <span className="text-success font-medium">{ownership.owned}</span> owned ·{" "}
                  <span className="text-foreground font-medium">{ownership.needed.length}</span> needed
                </span>
              </div>
              {ownership.needed.length === 0 ? (
                <p className="text-label text-success">
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
                        className="text-label px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground"
                      >
                        {e.name}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          <div>
            <SectionLabel className="block mb-1">Objectives</SectionLabel>
            <Textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Describe your deck's win conditions and play style…"
              rows={3}
              className="field-sizing-fixed min-h-0 resize-none bg-background text-body md:text-body"
            />
          </div>
        </div>
      )}

      {/* Search owns the screen; the deck is docked to the right edge, collapsed
          to a metadata rail until you expand it over the results. */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        <div className={`h-full flex flex-col overflow-hidden ${DOCK_RAIL_OFFSET}`}>
          <SectionHeader variant="panel">
            {step === "commander" ? (
              <>
                Step 1 · Choose a commander
                {commander && (
                  <button
                    onClick={() => setStep("potential")}
                    className="ml-auto text-body font-normal normal-case tracking-normal text-muted-foreground hover:text-foreground"
                  >
                    Keep {commander.name} →
                  </button>
                )}
              </>
            ) : (
              <>
                Step 2 · Build the potential pile
                <span className="font-normal normal-case tracking-normal text-muted-foreground">
                  — every card you add lands in Potential; there is no 100-card limit here.
                </span>
              </>
            )}
          </SectionHeader>
          <SearchPanel
            commanderColorIdentity={commander?.colorIdentity ?? []}
            commanderThemes={commanderThemes}
            entries={entries}
            onAdd={addCard}
            mode={step === "commander" ? "commander" : "build"}
            onSetCommander={chooseCommander}
            commanderCardId={commander?.cardId ?? null}
          />
        </div>

        <aside
          className={`absolute top-0 right-0 bottom-0 flex flex-col overflow-hidden border-l border-border bg-background transition-[width] duration-200 ease-out ${
            deckOpen ? "w-3/4 shadow-2xl" : DOCK_RAIL_WIDTH
          }`}
        >
          <SectionHeader variant="toolbar" className="flex-shrink-0">
            <span className="flex-1 truncate">
              Deck ({mainCount} main
              {maybeCount > 0 && ` · ${maybeCount} potential`}
              {wishlistCount > 0 && ` · ${wishlistCount} wishlist`}
              )
            </span>
            <button
              onClick={() => setDeckOpen((v) => !v)}
              title={deckOpen ? "Collapse deck" : "Expand deck"}
              aria-expanded={deckOpen}
              className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-ui text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              {deckOpen ? "›" : "‹"}
            </button>
          </SectionHeader>

          {deckOpen ? (
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
          ) : (
            <DeckSummary
              entries={entries}
              maybeboardName={maybeboardName}
              wishlistName={wishlistName}
            />
          )}
        </aside>
      </div>
    </FullHeightView>
  );
}
