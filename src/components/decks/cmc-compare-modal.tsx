"use client";

import { useEffect, useState } from "react";
import type { DeckEntry } from "@/lib/commander";

type Annotation = {
  id: string;
  content: string;
};

type CardAnnotations = Record<string, Annotation[]>;

interface Props {
  deckId: string;
  cmcLabel: string;
  cards: DeckEntry[];
  onClose: () => void;
}

export function CmcCompareModal({ deckId, cmcLabel, cards, onClose }: Props) {
  const [annotations, setAnnotations] = useState<CardAnnotations>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    const uniqueCards = cards.filter(
      (c, i, arr) => arr.findIndex((x) => x.cardId === c.cardId) === i
    );
    Promise.all(
      uniqueCards.map((c) =>
        fetch(`/api/decks/${deckId}/annotations?cardId=${encodeURIComponent(c.cardId)}`)
          .then((r) => r.json())
          .then((data: Annotation[]) => ({ cardId: c.cardId, data }))
      )
    ).then((results) => {
      const map: CardAnnotations = {};
      for (const { cardId, data } of results) map[cardId] = data;
      setAnnotations(map);
      setLoading(false);
    });
  }, [deckId, cards]);

  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold">CMC {cmcLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {totalCards} card{totalCards !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-border">
          {cards.map((entry) => {
            const cardAnnotations = annotations[entry.cardId] ?? [];
            return (
              <div key={entry.deckCardId} className="px-5 py-4 space-y-2">
                {/* Name + mana cost */}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">
                    {entry.quantity > 1 && (
                      <span className="text-muted-foreground font-normal mr-1.5">{entry.quantity}×</span>
                    )}
                    {entry.name}
                  </span>
                  {entry.manaCost && (
                    <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">
                      {entry.manaCost}
                    </span>
                  )}
                </div>

                {/* Type line */}
                <p className="text-[11px] text-muted-foreground/70 italic">{entry.typeLine}</p>

                {/* Oracle text */}
                {entry.oracleText && (
                  <div className="space-y-1">
                    {entry.oracleText.split("\n").map((para, i) => (
                      <p key={i} className="text-xs text-foreground/80 leading-relaxed">
                        {para}
                      </p>
                    ))}
                  </div>
                )}

                {/* Annotations */}
                {!loading && cardAnnotations.length > 0 && (
                  <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-primary/30">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Notes
                    </p>
                    {cardAnnotations.map((a) => (
                      <p key={a.id} className="text-xs text-foreground/70 whitespace-pre-wrap">
                        {a.content}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
