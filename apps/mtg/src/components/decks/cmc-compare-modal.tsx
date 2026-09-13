"use client";

import { useEffect, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";
import { SectionLabel } from "@/components/ui/section-header";
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
    <Modal open onClose={onClose} size="md">
      <ModalHeader
        title={`CMC ${cmcLabel}`}
        description={`${totalCards} card${totalCards !== 1 ? "s" : ""}`}
      />

      {/* Card list */}
      <ModalBody className="divide-y divide-border">
        {cards.map((entry) => {
            const cardAnnotations = annotations[entry.cardId] ?? [];
            return (
              <div key={entry.deckCardId} className="px-5 py-4 space-y-2">
                {/* Name + mana cost */}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ui font-semibold text-foreground">
                    {entry.quantity > 1 && (
                      <span className="text-muted-foreground font-normal mr-1.5">{entry.quantity}×</span>
                    )}
                    {entry.name}
                  </span>
                  {entry.manaCost && (
                    <span className="text-label font-mono text-muted-foreground flex-shrink-0">
                      {entry.manaCost}
                    </span>
                  )}
                </div>

                {/* Type line */}
                <p className="text-label text-muted-foreground/70 italic">{entry.typeLine}</p>

                {/* Oracle text */}
                {entry.oracleText && (
                  <div className="space-y-1">
                    {entry.oracleText.split("\n").map((para, i) => (
                      <p key={i} className="text-body text-foreground/80 leading-relaxed">
                        {para}
                      </p>
                    ))}
                  </div>
                )}

                {/* Annotations */}
                {!loading && cardAnnotations.length > 0 && (
                  <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-primary/30">
                    <SectionLabel size="micro" className="block">
                      Notes
                    </SectionLabel>
                    {cardAnnotations.map((a) => (
                      <p key={a.id} className="text-body text-foreground/70 whitespace-pre-wrap">
                        {a.content}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </ModalBody>
    </Modal>
  );
}
