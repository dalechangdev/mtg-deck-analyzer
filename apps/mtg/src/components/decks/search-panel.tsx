"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { CardData, DeckEntry } from "@/lib/commander";
import { isColorSubset, isBasicLand } from "@/lib/commander";
import { scoreCardSynergy, THEME_LABELS } from "@/lib/synergy";
import type { SynergyTheme } from "@/lib/synergy";
import {
  activeFilterChips,
  cardQueryToParams,
  clearFilter,
  emptyQuery,
  type CardQuery,
} from "@/lib/card-search";
import { AdvancedSearchModal } from "./advanced-search-modal";
import { CardDetailModal, type CardDetail } from "@/components/cards/card-detail-modal";

interface Props {
  commanderColorIdentity: string[];
  commanderThemes: Set<SynergyTheme>;
  entries: DeckEntry[];
  onAdd: (card: CardData, slot?: "main" | "maybe" | "wishlist") => void;
  /**
   * "build" adds cards to the potential pile; "commander" is step one of the
   * build, where every result is a candidate commander instead.
   */
  mode?: "build" | "commander";
  onSetCommander?: (card: CardData) => void;
  commanderCardId?: string | null;
}

const SYNERGY_STYLE: Record<0 | 1 | 2 | 3, string> = {
  0: "bg-muted/50 text-muted-foreground",
  1: "bg-warning-surface-strong text-warning",
  2: "bg-success-surface-strong text-success",
  3: "bg-success/20 text-success ring-1 ring-success/40",
};

/** Results per page. The API caps a page at 100. */
const PAGE_SIZE = 30;

const SYNERGY_LABEL: Record<0 | 1 | 2 | 3, string> = {
  0: "–",
  1: "↑",
  2: "↑↑",
  3: "↑↑↑",
};

export function SearchPanel({
  commanderColorIdentity,
  commanderThemes,
  entries,
  onAdd,
  mode = "build",
  onSetCommander,
  commanderCardId,
}: Props) {
  const pickingCommander = mode === "commander";
  const identity = commanderColorIdentity.join("");

  /**
   * Where the panel starts, and what the modal's Reset returns to: results
   * scoped to what the commander's colour identity actually allows, which is a
   * subset test rather than the loose overlap the colour pips used to send.
   */
  const baseQuery = useMemo(
    () =>
      emptyQuery({
        canBeCommander: pickingCommander,
        identity: pickingCommander ? [] : identity.split(""),
      }),
    [pickingCommander, identity]
  );

  const [query, setQuery] = useState<CardQuery>(baseQuery);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [results, setResults] = useState<CardData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Choosing (or changing) the commander re-scopes the search to its colours,
  // leaving every other filter the user set in place.
  const [scopedTo, setScopedTo] = useState(baseQuery);
  if (scopedTo !== baseQuery) {
    setScopedTo(baseQuery);
    setQuery((prev) => ({
      ...prev,
      identity: baseQuery.identity,
      identityMode: baseQuery.identityMode,
    }));
  }

  const inMainIds = new Set(entries.filter((e) => e.slot === "main").map((e) => e.cardId));
  const inMaybeIds = new Set(entries.filter((e) => e.slot === "maybe").map((e) => e.cardId));
  const inWishlistIds = new Set(entries.filter((e) => e.slot === "wishlist").map((e) => e.cardId));

  /** Step one only ever offers cards that can lead a deck, whatever the modal says. */
  const buildParams = useCallback(
    (source: CardQuery) =>
      cardQueryToParams({
        ...source,
        canBeCommander: pickingCommander || source.canBeCommander,
      }),
    [pickingCommander]
  );

  const search = buildParams(query).toString();

  // Any change to the filters puts you back on page one.
  const [pagedSearch, setPagedSearch] = useState(search);
  if (pagedSearch !== search) {
    setPagedSearch(search);
    setPage(1);
  }

  useEffect(() => {
    clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/cards?${search}&limit=${PAGE_SIZE}&page=${page}`);
      if (res.ok) {
        setResults(await res.json());
        setTotal(Number(res.headers.get("X-Total-Count") ?? 0));
        // A new page starts at its top, not wherever the last one was left.
        resultsRef.current?.scrollTo({ top: 0 });
      }
      setLoading(false);
    }, 250);
  }, [search, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = (page - 1) * PAGE_SIZE + results.length;

  /** Live match count for the modal's draft, before it is applied here. */
  const previewCount = useCallback(
    async (draft: CardQuery) => {
      const res = await fetch(`/api/cards?${buildParams(draft)}&limit=1`);
      return res.ok ? Number(res.headers.get("X-Total-Count") ?? 0) : 0;
    },
    [buildParams]
  );

  // The name box lives in the toolbar, so it doesn't need a chip of its own.
  const chips = activeFilterChips(query, baseQuery).filter((chip) => chip.key !== "name");

  /**
   * Results carry only the summary fields, so the full card — printing, faces,
   * stats — is fetched when a row is clicked.
   */
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [detailPending, setDetailPending] = useState<string | null>(null);

  async function openDetail(cardId: string) {
    setDetailPending(cardId);
    try {
      const res = await fetch(`/api/cards/${cardId}`);
      if (res.ok) setDetail(await res.json());
    } finally {
      setDetailPending(null);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls — one horizontal toolbar, so the results get the vertical space */}
      <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-b border-border flex-shrink-0">
        <Input
          value={query.name}
          onChange={(e) => setQuery((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={pickingCommander ? "Search legendary creatures…" : "Search cards…"}
          className="h-8 text-ui w-64 flex-shrink-0"
        />

        <Button variant="outline" size="sm" onClick={() => setAdvancedOpen(true)}>
          Advanced search
          {chips.length > 0 && (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-micro font-bold text-primary-foreground">
              {chips.length}
            </span>
          )}
        </Button>

        {/* One removable chip per filter set in the modal. */}
        {chips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setQuery((prev) => clearFilter(prev, chip.key, baseQuery))}
            title="Remove this filter"
            className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-label text-muted-foreground transition-colors hover:border-input hover:text-foreground"
          >
            {chip.label}
            <span aria-hidden>✕</span>
          </button>
        ))}

        {pickingCommander && chips.length === 0 && (
          <span className="text-label text-muted-foreground">
            Showing cards that can lead a deck.
          </span>
        )}

        <span className="ml-auto text-label text-muted-foreground whitespace-nowrap">
          {loading
            ? "Searching…"
            : total > results.length
              ? `${firstShown}–${lastShown} of ${total.toLocaleString()}`
              : `${total} result${total === 1 ? "" : "s"}`}
        </span>
      </div>

      <AdvancedSearchModal
        open={advancedOpen}
        query={query}
        base={baseQuery}
        onClose={() => setAdvancedOpen(false)}
        onApply={(next) => {
          setQuery(next);
          setAdvancedOpen(false);
        }}
        previewCount={previewCount}
      />

      <div
        ref={resultsRef}
        className="flex-1 overflow-y-auto p-2 grid gap-2 content-start grid-cols-[repeat(auto-fill,minmax(22rem,1fr))]"
      >
        {loading && results.length === 0 && (
          <div className="col-span-full p-4 text-body text-muted-foreground">Loading…</div>
        )}
        {!loading && results.length === 0 && (
          <div className="col-span-full p-4 text-body text-muted-foreground">No results</div>
        )}
        {results.map((card) => {
          const isBasic = isBasicLand(card.typeLine);
          const inMain = inMainIds.has(card.cardId);
          const inMaybe = inMaybeIds.has(card.cardId);
          const inWishlist = inWishlistIds.has(card.cardId);
          const alreadyInMain = !isBasic && inMain;
          const alreadyInMaybe = !isBasic && inMaybe;
          const alreadyInWishlist = !isBasic && inWishlist;
          const colorIllegal =
            !pickingCommander &&
            commanderColorIdentity.length > 0 &&
            !isColorSubset(card.colorIdentity, commanderColorIdentity);

          const synergy = commanderThemes.size > 0
            ? scoreCardSynergy(card.oracleText, card.keywords, commanderThemes)
            : null;

          return (
            <div
              key={card.cardId}
              aria-busy={detailPending === card.cardId}
              className={`relative flex gap-2.5 p-2 rounded-md border border-border/60 bg-background hover:bg-muted/40 hover:border-border transition-colors ${
                colorIllegal ? "opacity-50" : ""
              } ${detailPending === card.cardId ? "animate-pulse" : ""}`}
            >
              {/*
                The whole row opens the card. It is one transparent button
                underneath the content — which is pointer-events-none, so
                clicks fall through — leaving the add buttons below as the only
                other target, and only one tab stop per result.
              */}
              <button
                type="button"
                onClick={() => openDetail(card.cardId)}
                className="absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="sr-only">Show details for {card.name}</span>
              </button>

              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt={card.name} className="w-20 self-start rounded-md flex-shrink-0 pointer-events-none" loading="lazy" />
              ) : (
                <div className="w-20 h-28 rounded-md bg-muted flex-shrink-0 pointer-events-none" />
              )}

              <div className="flex-1 min-w-0 flex flex-col gap-1 pointer-events-none">
                <div className="flex items-start gap-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-ui font-medium truncate">{card.name}</div>
                    <div className="text-label text-muted-foreground truncate">
                      {card.manaCost && <span className="font-mono mr-1">{card.manaCost}</span>}
                      {card.typeLine}
                    </div>
                  </div>

                  {/* Owned badge */}
                  {(card.ownedQuantity ?? 0) > 0 && (
                    <span
                      title="In your library"
                      className="flex-shrink-0 text-micro font-bold px-1.5 py-0.5 rounded-md bg-success/20 text-success"
                    >
                      Owned
                    </span>
                  )}

                  {/* Synergy badge */}
                  {synergy && synergy.score > 0 && (
                    <div
                      title={synergy.matchedThemes.map((t) => THEME_LABELS[t]).join(", ")}
                      className={`flex-shrink-0 text-micro font-bold px-1.5 py-0.5 rounded-md ${SYNERGY_STYLE[synergy.score]}`}
                    >
                      {SYNERGY_LABEL[synergy.score]}
                    </div>
                  )}
                </div>

                {/* Ability text — the reason this panel is now the wide row */}
                {card.oracleText && (
                  <p className="text-body text-muted-foreground whitespace-pre-line leading-snug">
                    {card.oracleText}
                  </p>
                )}

                <div className="relative flex items-center gap-1.5 mt-auto pt-1 pointer-events-auto">
                  {pickingCommander ? (
                    <button
                      onClick={() => onSetCommander?.(card)}
                      disabled={commanderCardId === card.cardId}
                      title={
                        commanderCardId === card.cardId
                          ? "Already your commander"
                          : "Lead the deck with this card"
                      }
                      className={`flex-shrink-0 px-2.5 h-6 rounded-full flex items-center text-label font-medium transition-colors ${
                        commanderCardId === card.cardId
                          ? "bg-success-surface-strong text-success cursor-default"
                          : "bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground"
                      }`}
                    >
                      {commanderCardId === card.cardId ? "✓ commander" : "Set as commander"}
                    </button>
                  ) : (
                    <>
                      {/* Potential — the default landing spot while theorizing */}
                      <button
                        onClick={() => !alreadyInMaybe && !alreadyInMain && onAdd(card, "maybe")}
                        disabled={alreadyInMaybe || alreadyInMain}
                        title={
                          alreadyInMain ? "Already in the main deck" :
                          alreadyInMaybe ? "Already in potential" :
                          "Add to potential"
                        }
                        className={`flex-shrink-0 px-2 h-6 rounded-full flex items-center text-label font-medium transition-colors ${
                          alreadyInMaybe
                            ? "bg-warning-surface-strong text-warning cursor-default"
                            : alreadyInMain
                              ? "bg-muted text-muted-foreground cursor-default"
                              : "bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground"
                        }`}
                      >
                        {alreadyInMaybe ? "✓ potential" : "+ potential"}
                      </button>

                      {/* Straight to the main deck, for cards you're already sure of */}
                      <button
                        onClick={() => !alreadyInMain && onAdd(card, "main")}
                        disabled={alreadyInMain}
                        title={
                          alreadyInMain ? "Already in the main deck" :
                          colorIllegal ? "Color identity violation" :
                          inMain ? "Add another" : "Add straight to the main deck"
                        }
                        className={`flex-shrink-0 px-2 h-6 rounded-full flex items-center text-label font-medium border transition-colors ${
                          alreadyInMain
                            ? "border-transparent bg-success-surface-strong text-success cursor-default"
                            : "border-border text-muted-foreground hover:border-success-border hover:text-success"
                        }`}
                      >
                        {alreadyInMain ? "✓ in deck" : "+ main"}
                      </button>

                      {/* Add to wishlist */}
                      <button
                        onClick={() => !alreadyInWishlist && onAdd(card, "wishlist")}
                        disabled={alreadyInWishlist || alreadyInMain}
                        title={
                          alreadyInMain ? "Already in main deck" :
                          alreadyInWishlist ? "Already in wishlist" :
                          "Add to wishlist"
                        }
                        className={`flex-shrink-0 px-2 h-6 rounded-full flex items-center text-label font-medium border transition-colors ${
                          alreadyInWishlist || alreadyInMain
                            ? "border-border text-muted-foreground cursor-default opacity-40"
                            : "border-border text-muted-foreground hover:border-highlight hover:text-highlight"
                        }`}
                      >
                        ★ wishlist
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pager sits outside the scroll area, so it stays reachable. */}
      {totalPages > 1 && (
        <div className="flex flex-shrink-0 items-center justify-center gap-1.5 border-t border-border px-3 py-1.5">
          <Button variant="ghost" size="xs" disabled={page === 1} onClick={() => setPage(1)}>
            « First
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹ Prev
          </Button>
          <span className="px-1 text-label text-muted-foreground whitespace-nowrap">
            Page {page} of {totalPages.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="xs"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next ›
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            Last »
          </Button>
        </div>
      )}

      {detail && <CardDetailModal card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
