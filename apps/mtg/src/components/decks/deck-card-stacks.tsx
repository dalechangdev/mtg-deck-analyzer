"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DeckEntry } from "@/lib/commander";
import { groupByType } from "@/lib/deck-breakdown";
import type { CardDetail } from "@/components/cards/card-detail-modal";
import { SectionHeader, SectionLabel } from "@/components/ui/section-header";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Props {
  entries: DeckEntry[];
  cardDetails: Record<string, CardDetail>;
  onInspect: (cardId: string) => void;
}

type View = "stacks" | "list";

// A card is 63×88, so its height is 139.7% of its width. Each card but the last
// in a stack is pulled up under the next one, leaving this much of its top — the
// name bar and mana cost — showing. Negative margins resolve against the
// column's width, which is also the card's, so the peek scales with the column.
const CARD_HEIGHT_PCT = (88 / 63) * 100;
const PEEK_PCT = 14;
const OVERLAP_MARGIN = `-${CARD_HEIGHT_PCT - PEEK_PCT}%`;

const PREVIEW_WIDTH = 250;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (88 / 63));
const PREVIEW_GAP = 12;

type Preview = { images: string[]; name: string; top: number; left: number };

const count = (cards: { quantity: number }[]) => cards.reduce((sum, c) => sum + c.quantity, 0);

/**
 * The main deck as Moxfield-style stacks — one column per card type, each card
 * overlapped so only its name bar shows, full image on hover — or as a plain
 * list in the same grouping.
 */
export function DeckCardStacks({ entries, cardDetails, onInspect }: Props) {
  const [view, setView] = useState<View>("stacks");
  const [preview, setPreview] = useState<Preview | null>(null);

  // The preview is fixed to the viewport, so scrolling would strand it beside
  // a card that has moved away.
  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
  }, [preview]);

  const groups = useMemo(() => {
    const commander = entries.filter((e) => e.isCommander);
    const main = entries.filter((e) => !e.isCommander && e.slot === "main");
    return [
      ...(commander.length > 0 ? [{ category: "Commander", cards: commander }] : []),
      ...groupByType(main),
    ];
  }, [entries]);

  const total = count(groups.flatMap((g) => g.cards));

  // Every face's image, so a double-faced card previews both sides.
  const imagesOf = (card: DeckEntry): string[] => {
    const faces = (cardDetails[card.cardId]?.faces ?? [])
      .map((f) => f.imageUrl)
      .filter((url): url is string => Boolean(url));
    if (faces.length > 1) return faces;
    return card.imageUrl ? [card.imageUrl] : [];
  };

  const showPreview = (card: DeckEntry, el: HTMLElement) => {
    const images = imagesOf(card);
    if (images.length === 0) return;
    const rect = el.getBoundingClientRect();
    const width = images.length * PREVIEW_WIDTH + (images.length - 1) * 8;
    // Beside the stack, on whichever side has room; clamped to the viewport.
    const right = rect.right + PREVIEW_GAP;
    const left =
      right + width <= window.innerWidth ? right : Math.max(8, rect.left - PREVIEW_GAP - width);
    const top = Math.min(Math.max(8, rect.top), window.innerHeight - PREVIEW_HEIGHT - 8);
    setPreview({ images, name: card.name, top, left });
  };

  return (
    <section className="border-b border-border">
      <SectionHeader className="justify-between gap-3 px-4">
        <span>Deck list ({total})</span>
        <ToggleGroup
          value={[view]}
          onValueChange={(value) => {
            // Base UI allows an empty selection; keep the last choice.
            const next = value[0] as View | undefined;
            if (next) setView(next);
          }}
          multiple={false}
          variant="outline"
          size="sm"
          spacing={0}
        >
          <ToggleGroupItem value="stacks" className="h-6 min-w-0 px-2 text-micro">
            Images
          </ToggleGroupItem>
          <ToggleGroupItem value="list" className="h-6 min-w-0 px-2 text-micro">
            List
          </ToggleGroupItem>
        </ToggleGroup>
      </SectionHeader>

      {total === 0 ? (
        <p className="px-4 py-2 text-label text-muted-foreground">No cards in the main deck yet.</p>
      ) : view === "stacks" ? (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-5 px-4 py-3">
          {groups.map((group) => (
            <div key={group.category} className="w-36 flex-shrink-0">
              <SectionLabel size="micro" className="mb-1 block">
                {group.category} ({count(group.cards)})
              </SectionLabel>
              <ul>
                {group.cards.map((card, i) => (
                  <li
                    key={card.deckCardId}
                    className="relative"
                    style={i > 0 ? { marginTop: OVERLAP_MARGIN } : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => onInspect(card.cardId)}
                      disabled={!cardDetails[card.cardId]}
                      onMouseEnter={(e) => showPreview(card, e.currentTarget)}
                      onMouseLeave={() => setPreview(null)}
                      onFocus={(e) => showPreview(card, e.currentTarget)}
                      onBlur={() => setPreview(null)}
                      aria-label={card.name}
                      className="block w-full rounded-[4.75%/3.5%] shadow-md ring-offset-background transition-transform enabled:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                    >
                      {card.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={card.imageUrl}
                          alt=""
                          loading="lazy"
                          className="block aspect-[63/88] w-full rounded-[4.75%/3.5%] bg-muted object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[63/88] w-full items-start justify-between gap-1 rounded-[4.75%/3.5%] border border-border bg-muted px-2 py-1.5 text-left">
                          <span className="truncate text-label font-medium">{card.name}</span>
                          <span className="flex-shrink-0 font-mono text-micro text-muted-foreground">
                            {card.manaCost ?? ""}
                          </span>
                        </div>
                      )}
                    </button>
                    {card.quantity > 1 && (
                      <span className="pointer-events-none absolute right-1 top-[18%] rounded-md bg-background/90 px-1 font-mono text-micro font-medium text-foreground shadow">
                        ×{card.quantity}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="columns-1 gap-x-6 px-4 py-2 sm:columns-2 lg:columns-3">
          {groups.map((group) => (
            <div key={group.category} className="mb-2 break-inside-avoid">
              <SectionLabel size="micro" className="font-normal">
                {group.category} ({count(group.cards)})
              </SectionLabel>
              <ul>
                {group.cards.map((card) => (
                  <li key={card.deckCardId} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onInspect(card.cardId)}
                      disabled={!cardDetails[card.cardId]}
                      onMouseEnter={(e) => showPreview(card, e.currentTarget)}
                      onMouseLeave={() => setPreview(null)}
                      className="flex w-full min-w-0 items-baseline gap-1 py-0.5 text-left text-label enabled:hover:underline disabled:cursor-default"
                    >
                      <span className="w-4 flex-shrink-0 font-mono text-muted-foreground">
                        {card.quantity}
                      </span>
                      <span className="truncate">{card.name}</span>
                      <span className="ml-auto flex-shrink-0 font-mono text-muted-foreground">
                        {card.manaCost ?? ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Portalled so the scroll container's overflow can't clip it. */}
      {preview &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 flex gap-2"
            style={{ top: preview.top, left: preview.left }}
          >
            {preview.images.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt={preview.name}
                style={{ width: PREVIEW_WIDTH }}
                className="aspect-[63/88] rounded-[4.75%/3.5%] bg-muted shadow-2xl"
              />
            ))}
          </div>,
          document.body
        )}
    </section>
  );
}
