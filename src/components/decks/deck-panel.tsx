"use client";

import { CATEGORY_ORDER, getCardCategory, validateDeck, isColorSubset } from "@/lib/commander";
import type { DeckEntry } from "@/lib/commander";

interface Props {
  entries: DeckEntry[];
  onRemove: (deckCardId: string) => void;
  onSetCommander: (deckCardId: string) => void;
}

export function DeckPanel({ entries, onRemove, onSetCommander }: Props) {
  const validation = validateDeck(entries);
  const commander = entries.find((e) => e.isCommander);
  const nonCommander = entries.filter((e) => !e.isCommander);

  const grouped = CATEGORY_ORDER.reduce<Record<string, DeckEntry[]>>((acc, cat) => {
    acc[cat] = nonCommander.filter((e) => getCardCategory(e.typeLine) === cat);
    return acc;
  }, {} as Record<string, DeckEntry[]>);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Validation bar */}
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
            />
          </section>
        ) : (
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            No commander set — right-click a card to set it.
          </div>
        )}

        {/* Other categories */}
        {CATEGORY_ORDER.map((cat) => {
          const cards = grouped[cat];
          if (!cards || cards.length === 0) return null;
          return (
            <section key={cat} className="border-b border-border">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 sticky top-0">
                {cat} ({cards.length})
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
                />
              ))}
            </section>
          );
        })}
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
}: {
  entry: DeckEntry;
  onRemove: (id: string) => void;
  isViolation: boolean;
  showCommanderToggle: boolean;
  onSetCommander: (id: string) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 ${
        isViolation ? "bg-red-950/20" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <span className={`text-xs truncate block ${isViolation ? "text-red-400" : ""}`}>
          {isViolation && <span className="mr-1">⚠</span>}
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
