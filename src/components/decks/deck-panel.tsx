"use client";

import { CATEGORY_ORDER, getCardCategory, validateDeck } from "@/lib/commander";
import type { DeckEntry } from "@/lib/commander";

interface Props {
  entries: DeckEntry[];
  onRemove: (deckCardId: string) => void;
  onSetCommander: (deckCardId: string) => void;
  onMoveCard: (deckCardId: string, slot: "main" | "maybe") => void;
  maybeboardName: string;
  onMaybeboardNameChange: (val: string) => void;
}

export function DeckPanel({ entries, onRemove, onSetCommander, onMoveCard, maybeboardName, onMaybeboardNameChange }: Props) {
  const validation = validateDeck(entries);
  const commander = entries.find((e) => e.isCommander);
  const mainCards = entries.filter((e) => !e.isCommander && e.slot === "main");
  const maybeCards = entries.filter((e) => e.slot === "maybe");

  const grouped = CATEGORY_ORDER.reduce<Record<string, DeckEntry[]>>((acc, cat) => {
    acc[cat] = mainCards.filter((e) => getCardCategory(e.typeLine) === cat);
    return acc;
  }, {} as Record<string, DeckEntry[]>);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Validation bar */}
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

      <div className="flex-1 overflow-y-auto">
        {/* Commander section */}
        {commander ? (
          <section className="border-b border-border">
            <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
              Commander
            </div>
            <CardRow
              entry={commander}
              onRemove={onRemove}
              isViolation={false}
              showCommanderToggle={false}
              onSetCommander={onSetCommander}
              onMoveCard={onMoveCard}
            />
          </section>
        ) : (
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            No commander set — right-click a card to set it.
          </div>
        )}

        {/* Main deck categories */}
        {CATEGORY_ORDER.map((cat) => {
          const cards = grouped[cat];
          if (!cards || cards.length === 0) return null;
          return (
            <section key={cat} className="border-b border-border">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 sticky top-0">
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
                />
              ))}
            </section>
          );
        })}

        {/* Maybeboard */}
        {maybeCards.length > 0 && (
          <section className="border-b border-border">
            <div className="flex items-center gap-1 px-3 py-1.5 bg-amber-950/20 sticky top-0">
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
            {maybeCards.map((entry) => (
              <CardRow
                key={entry.deckCardId}
                entry={entry}
                onRemove={onRemove}
                isViolation={false}
                showCommanderToggle={false}
                onSetCommander={onSetCommander}
                onMoveCard={onMoveCard}
                isMaybe
              />
            ))}
          </section>
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
  isMaybe = false,
}: {
  entry: DeckEntry;
  onRemove: (id: string) => void;
  isViolation: boolean;
  showCommanderToggle: boolean;
  onSetCommander: (id: string) => void;
  onMoveCard: (id: string, slot: "main" | "maybe") => void;
  isMaybe?: boolean;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 ${
        isViolation ? "bg-red-950/20" : isMaybe ? "bg-amber-950/10" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <span className={`text-xs truncate block ${isViolation ? "text-red-400" : isMaybe ? "text-amber-400/80" : ""}`}>
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
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {showCommanderToggle && (
          <button
            onClick={() => onSetCommander(entry.deckCardId)}
            title="Set as commander"
            className="text-[10px] px-1.5 py-0.5 rounded border border-amber-600/50 text-amber-400 hover:bg-amber-950/40"
          >
            ★
          </button>
        )}
        {isMaybe ? (
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
