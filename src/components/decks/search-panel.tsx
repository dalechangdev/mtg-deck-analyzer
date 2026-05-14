"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import type { CardData, DeckEntry } from "@/lib/commander";
import { isColorSubset, isBasicLand } from "@/lib/commander";
import { scoreCardSynergy, THEME_LABELS } from "@/lib/synergy";
import type { SynergyTheme } from "@/lib/synergy";

interface Props {
  commanderColorIdentity: string[];
  commanderThemes: Set<SynergyTheme>;
  entries: DeckEntry[];
  onAdd: (card: CardData, slot?: "main" | "maybe" | "wishlist") => void;
}

const COLOR_LABELS: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const COLOR_STYLE: Record<string, string> = {
  W: "bg-yellow-50 border-yellow-400 text-yellow-900",
  U: "bg-blue-600 border-blue-800 text-white",
  B: "bg-zinc-900 border-zinc-600 text-zinc-100",
  R: "bg-red-600 border-red-800 text-white",
  G: "bg-green-700 border-green-900 text-white",
};

const SYNERGY_STYLE: Record<0 | 1 | 2 | 3, string> = {
  0: "bg-muted/50 text-muted-foreground",
  1: "bg-yellow-900/40 text-yellow-400",
  2: "bg-green-900/40 text-green-400",
  3: "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40",
};

const SYNERGY_LABEL: Record<0 | 1 | 2 | 3, string> = {
  0: "–",
  1: "↑",
  2: "↑↑",
  3: "↑↑↑",
};

export function SearchPanel({ commanderColorIdentity, commanderThemes, entries, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>(commanderColorIdentity);
  const [commanderOnly, setCommanderOnly] = useState(false);
  const [results, setResults] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inMainIds = new Set(entries.filter((e) => e.slot === "main").map((e) => e.cardId));
  const inMaybeIds = new Set(entries.filter((e) => e.slot === "maybe").map((e) => e.cardId));
  const inWishlistIds = new Set(entries.filter((e) => e.slot === "wishlist").map((e) => e.cardId));

  useEffect(() => {
    clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "30" });
      if (query) params.set("q", query);
      if (colors.length > 0) params.set("colors", colors.join(","));
      if (commanderOnly) params.set("commander", "1");
      const res = await fetch(`/api/cards?${params}`);
      if (res.ok) setResults(await res.json());
      setLoading(false);
    }, 250);
  }, [query, colors, commanderOnly]);

  function toggleColor(c: string) {
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 space-y-2 border-b border-border flex-shrink-0">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards…"
          className="h-8 text-sm"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          {Object.keys(COLOR_LABELS).map((c) => {
            const active = colors.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleColor(c)}
                title={COLOR_LABELS[c]}
                className={`w-6 h-6 rounded-full border-2 font-bold text-[10px] transition-all ${COLOR_STYLE[c]} ${
                  active ? "scale-110 ring-2 ring-offset-1 ring-offset-background ring-white/30" : "opacity-40"
                }`}
              >
                {c}
              </button>
            );
          })}
          <button
            onClick={() => setCommanderOnly((v) => !v)}
            className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
              commanderOnly
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Commanders
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && results.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">Loading…</div>
        )}
        {!loading && results.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">No results</div>
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
            commanderColorIdentity.length > 0 &&
            !isColorSubset(card.colorIdentity, commanderColorIdentity);

          const synergy = commanderThemes.size > 0
            ? scoreCardSynergy(card.oracleText, card.keywords, commanderThemes)
            : null;

          return (
            <div
              key={card.cardId}
              className={`flex items-center gap-2 px-3 py-2 border-b border-border/50 hover:bg-muted/40 ${
                colorIllegal ? "opacity-50" : ""
              }`}
            >
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt={card.name} className="w-8 rounded flex-shrink-0" loading="lazy" />
              ) : (
                <div className="w-8 h-11 rounded bg-muted flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{card.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {card.manaCost && <span className="font-mono mr-1">{card.manaCost}</span>}
                  {card.typeLine}
                </div>
              </div>

              {/* Synergy badge */}
              {synergy && synergy.score > 0 && (
                <div
                  title={synergy.matchedThemes.map((t) => THEME_LABELS[t]).join(", ")}
                  className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${SYNERGY_STYLE[synergy.score]}`}
                >
                  {SYNERGY_LABEL[synergy.score]}
                </div>
              )}

              {/* Add to main */}
              <button
                onClick={() => !alreadyInMain && onAdd(card, "main")}
                disabled={alreadyInMain}
                title={
                  alreadyInMain ? "Already in deck" :
                  colorIllegal ? "Color identity violation" :
                  inMain ? "Add another" : "Add to deck"
                }
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  alreadyInMain
                    ? "bg-muted text-muted-foreground cursor-default"
                    : "bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground"
                }`}
              >
                {alreadyInMain ? "✓" : "+"}
              </button>

              {/* Add to maybeboard */}
              <button
                onClick={() => !alreadyInMaybe && onAdd(card, "maybe")}
                disabled={alreadyInMaybe || alreadyInMain}
                title={
                  alreadyInMain ? "Already in main deck" :
                  alreadyInMaybe ? "Already in maybeboard" :
                  "Add to maybeboard"
                }
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors ${
                  alreadyInMaybe || alreadyInMain
                    ? "border-border text-muted-foreground cursor-default opacity-40"
                    : "border-border text-muted-foreground hover:border-amber-500 hover:text-amber-400"
                }`}
              >
                ?
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
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors ${
                  alreadyInWishlist || alreadyInMain
                    ? "border-border text-muted-foreground cursor-default opacity-40"
                    : "border-border text-muted-foreground hover:border-purple-500 hover:text-purple-400"
                }`}
              >
                ★
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
