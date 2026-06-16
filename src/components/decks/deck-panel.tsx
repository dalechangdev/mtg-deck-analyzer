"use client";

import { useState } from "react";
import { CATEGORY_ORDER, getCardCategory, validateDeck } from "@/lib/commander";
import type { DeckEntry } from "@/lib/commander";

const CMC_BUCKETS = [0, 1, 2, 3, 4, 5] as const;
const CMC_LABEL = (n: number) => (n >= 6 ? "6+" : String(n));
const CMC_MAX = 6;

interface Props {
  entries: DeckEntry[];
  onRemove: (deckCardId: string) => void;
  onSetCommander: (deckCardId: string) => void;
  onMoveCard: (deckCardId: string, slot: "main" | "maybe" | "wishlist") => void;
  onAnnotate: (cardId: string, cardName: string) => void;
  maybeboardName: string;
  onMaybeboardNameChange: (val: string) => void;
  wishlistName: string;
  onWishlistNameChange: (val: string) => void;
}

export function DeckPanel({ entries, onRemove, onSetCommander, onMoveCard, onAnnotate, maybeboardName, onMaybeboardNameChange, wishlistName, onWishlistNameChange }: Props) {
  const [groupBy, setGroupBy] = useState<"type" | "cmc">("type");

  const validation = validateDeck(entries);
  const commander = entries.find((e) => e.isCommander);
  const mainCards = entries.filter((e) => !e.isCommander && e.slot === "main");
  const maybeCards = entries.filter((e) => e.slot === "maybe");
  const wishlistCards = entries.filter((e) => e.slot === "wishlist");

  const grouped = CATEGORY_ORDER.reduce<Record<string, DeckEntry[]>>((acc, cat) => {
    acc[cat] = mainCards
      .filter((e) => getCardCategory(e.typeLine) === cat)
      .sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name));
    return acc;
  }, {} as Record<string, DeckEntry[]>);

  const nonLandMainCards = mainCards.filter((e) => getCardCategory(e.typeLine) !== "Lands");
  const landMainCards = mainCards.filter((e) => getCardCategory(e.typeLine) === "Lands").sort((a, b) => a.name.localeCompare(b.name));

  const groupedByCmc = [...CMC_BUCKETS, CMC_MAX].reduce<Record<number, DeckEntry[]>>((acc, n) => {
    acc[n] = nonLandMainCards
      .filter((e) => (n === CMC_MAX ? (e.cmc ?? 0) >= CMC_MAX : (e.cmc ?? 0) === n))
      .sort((a, b) => a.name.localeCompare(b.name));
    return acc;
  }, {} as Record<number, DeckEntry[]>);

  const hasMaybe = maybeCards.length > 0;
  const hasWishlist = wishlistCards.length > 0;
  const hasSideColumn = hasMaybe || hasWishlist;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Validation bar — spans full width */}
      {(validation.colorViolations.length > 0 || validation.duplicates.length > 0) && (
        <div className="px-3 py-2 border-b border-border flex-shrink-0 space-y-1">
          {validation.colorViolations.length > 0 && (
            <div className="text-xs text-red-400">
              ⚠ {validation.colorViolations.length} color identity violation
              {validation.colorViolations.length !== 1 ? "s" : ""}
            </div>
          )}
          {validation.duplicates.length > 0 && (
            <div className="text-xs text-amber-400">
              ⚠ {validation.duplicates.length} duplicate card
              {validation.duplicates.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {/* Two-column area */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Main deck column ── */}
        <div className={`flex flex-col overflow-hidden min-w-0 ${hasSideColumn ? "flex-1 border-r border-border" : "flex-1"}`}>
          <div className="px-3 py-1.5 bg-muted/30 border-b border-border flex-shrink-0 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
              Main Deck ({validation.cardCount})
            </span>
            <div className="flex text-[10px] rounded overflow-hidden border border-border">
              <button
                onClick={() => setGroupBy("type")}
                className={`px-2 py-0.5 ${groupBy === "type" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Type
              </button>
              <button
                onClick={() => setGroupBy("cmc")}
                className={`px-2 py-0.5 border-l border-border ${groupBy === "cmc" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                CMC
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {commander ? (
              <section className="border-b border-border">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20">
                  Commander
                </div>
                <CardRow
                  entry={commander}
                  onRemove={onRemove}
                  isViolation={false}
                  showCommanderToggle={false}
                  onSetCommander={onSetCommander}
                  onMoveCard={onMoveCard}
                  onAnnotate={onAnnotate}
                />
              </section>
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                No commander set — right-click a card to set it.
              </div>
            )}

            {groupBy === "type"
              ? CATEGORY_ORDER.map((cat) => {
                  const cards = grouped[cat];
                  if (!cards || cards.length === 0) return null;
                  return (
                    <section key={cat} className="border-b border-border">
                      <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 sticky top-0">
                        {cat} ({cards.reduce((sum, e) => sum + e.quantity, 0)})
                      </div>
                      {cards.map((entry) => (
                        <CardRow
                          key={entry.deckCardId}
                          entry={entry}
                          onRemove={onRemove}
                          isViolation={
                            validation.colorViolations.includes(entry.cardId) ||
                            validation.duplicates.includes(entry.cardId)
                          }
                          showCommanderToggle={entry.canBeCommander && !commander}
                          onSetCommander={onSetCommander}
                          onMoveCard={onMoveCard}
                          onAnnotate={onAnnotate}
                        />
                      ))}
                    </section>
                  );
                })
              : <>
                  {[...CMC_BUCKETS, CMC_MAX].map((n) => {
                    const cards = groupedByCmc[n];
                    if (!cards || cards.length === 0) return null;
                    return (
                      <section key={n} className="border-b border-border">
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 sticky top-0">
                          CMC {CMC_LABEL(n)} ({cards.reduce((sum, e) => sum + e.quantity, 0)})
                        </div>
                        {cards.map((entry) => (
                          <CardRow
                            key={entry.deckCardId}
                            entry={entry}
                            onRemove={onRemove}
                            isViolation={
                              validation.colorViolations.includes(entry.cardId) ||
                              validation.duplicates.includes(entry.cardId)
                            }
                            showCommanderToggle={entry.canBeCommander && !commander}
                            onSetCommander={onSetCommander}
                            onMoveCard={onMoveCard}
                            onAnnotate={onAnnotate}
                          />
                        ))}
                      </section>
                    );
                  })}
                  {landMainCards.length > 0 && (
                    <section className="border-b border-border">
                      <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 sticky top-0">
                        Lands ({landMainCards.reduce((sum, e) => sum + e.quantity, 0)})
                      </div>
                      {landMainCards.map((entry) => (
                        <CardRow
                          key={entry.deckCardId}
                          entry={entry}
                          onRemove={onRemove}
                          isViolation={
                            validation.colorViolations.includes(entry.cardId) ||
                            validation.duplicates.includes(entry.cardId)
                          }
                          showCommanderToggle={entry.canBeCommander && !commander}
                          onSetCommander={onSetCommander}
                          onMoveCard={onMoveCard}
                          onAnnotate={onAnnotate}
                        />
                      ))}
                    </section>
                  )}
                </>}
          </div>
        </div>

        {/* ── Side column: maybeboard (top half) + wishlist (bottom half) ── */}
        {hasSideColumn && (
          <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden">

            {/* Maybeboard — top half */}
            <div className={`flex flex-col overflow-hidden bg-amber-950/5 ${hasMaybe && hasWishlist ? "flex-1 border-b border-amber-900/30" : hasMaybe ? "flex-1" : "hidden"}`}>
              <div className="flex items-center gap-1 px-3 py-1.5 bg-amber-950/20 border-b border-amber-900/30 flex-shrink-0">
                <input
                  value={maybeboardName}
                  onChange={(e) => onMaybeboardNameChange(e.target.value)}
                  placeholder="Maybeboard"
                  className="flex-1 text-[11px] font-semibold text-amber-500/80 uppercase tracking-wider bg-transparent focus:outline-none placeholder:text-amber-500/40 min-w-0"
                />
                <span className="text-[11px] text-amber-500/60 flex-shrink-0">
                  ({maybeCards.reduce((sum, e) => sum + e.quantity, 0)})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {maybeCards.map((entry) => (
                  <CardRow
                    key={entry.deckCardId}
                    entry={entry}
                    onRemove={onRemove}
                    isViolation={false}
                    showCommanderToggle={false}
                    onSetCommander={onSetCommander}
                    onMoveCard={onMoveCard}
                    onAnnotate={onAnnotate}
                    isMaybe
                  />
                ))}
              </div>
            </div>

            {/* Wishlist — bottom half */}
            <div className={`flex flex-col overflow-hidden bg-purple-950/5 ${hasWishlist ? "flex-1" : "hidden"}`}>
              <div className="flex items-center gap-1 px-3 py-1.5 bg-purple-950/20 border-b border-purple-900/30 flex-shrink-0">
                <input
                  value={wishlistName}
                  onChange={(e) => onWishlistNameChange(e.target.value)}
                  placeholder="Wishlist"
                  className="flex-1 text-[11px] font-semibold text-purple-400/80 uppercase tracking-wider bg-transparent focus:outline-none placeholder:text-purple-400/40 min-w-0"
                />
                <span className="text-[11px] text-purple-400/60 flex-shrink-0">
                  ({wishlistCards.reduce((sum, e) => sum + e.quantity, 0)})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {wishlistCards.map((entry) => (
                  <CardRow
                    key={entry.deckCardId}
                    entry={entry}
                    onRemove={onRemove}
                    isViolation={false}
                    showCommanderToggle={false}
                    onSetCommander={onSetCommander}
                    onMoveCard={onMoveCard}
                    onAnnotate={onAnnotate}
                    isWishlist
                  />
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

function CardRow({
  entry,
  onRemove,
  isViolation,
  showCommanderToggle,
  onSetCommander,
  onMoveCard,
  onAnnotate,
  isMaybe = false,
  isWishlist = false,
}: {
  entry: DeckEntry;
  onRemove: (id: string) => void;
  isViolation: boolean;
  showCommanderToggle: boolean;
  onSetCommander: (id: string) => void;
  onMoveCard: (id: string, slot: "main" | "maybe" | "wishlist") => void;
  onAnnotate: (cardId: string, cardName: string) => void;
  isMaybe?: boolean;
  isWishlist?: boolean;
}) {
  const textColor = isViolation ? "text-red-400" : isMaybe ? "text-amber-400/80" : isWishlist ? "text-purple-400/80" : "";
  const rowBg = isViolation ? "bg-red-950/20" : isMaybe ? "bg-amber-950/10" : isWishlist ? "bg-purple-950/10" : "";

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer ${rowBg}`}
      onClick={() => onAnnotate(entry.cardId, entry.name)}
    >
      <div className="flex-1 min-w-0">
        <span className={`text-xs truncate block ${textColor}`}>
          {isViolation && <span className="mr-1">⚠</span>}
          {entry.quantity > 1 && (
            <span className="text-muted-foreground mr-1">{entry.quantity}×</span>
          )}
          {entry.name}
        </span>
        {entry.manaCost && (
          <span className="text-[11px] text-muted-foreground font-mono">{entry.manaCost}</span>
        )}
      </div>
      <div
        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {showCommanderToggle && (
          <button
            onClick={() => onSetCommander(entry.deckCardId)}
            title="Set as commander"
            className="text-[10px] px-1.5 py-0.5 rounded border border-amber-600/50 text-amber-400 hover:bg-amber-950/40"
          >
            ★
          </button>
        )}
        {isWishlist ? (
          <>
            <button
              onClick={() => onMoveCard(entry.deckCardId, "maybe")}
              title="Move to maybeboard"
              className="text-[10px] px-1.5 py-0.5 rounded border border-amber-600/50 text-amber-400 hover:bg-amber-950/40"
            >
              → maybe
            </button>
            <button
              onClick={() => onMoveCard(entry.deckCardId, "main")}
              title="Move to main deck"
              className="text-[10px] px-1.5 py-0.5 rounded border border-green-600/50 text-green-400 hover:bg-green-950/40"
            >
              → main
            </button>
          </>
        ) : isMaybe ? (
          <button
            onClick={() => onMoveCard(entry.deckCardId, "main")}
            title="Move to main deck"
            className="text-[10px] px-1.5 py-0.5 rounded border border-green-600/50 text-green-400 hover:bg-green-950/40"
          >
            → main
          </button>
        ) : (
          <button
            onClick={() => onMoveCard(entry.deckCardId, "maybe")}
            title="Move to maybeboard"
            className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:border-amber-600/50 hover:text-amber-400"
          >
            → maybe
          </button>
        )}
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
