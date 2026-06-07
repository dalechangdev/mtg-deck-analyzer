"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

type SetOption = {
  code: string;
  name: string;
  cardCount: number;
  releasedAt: string | null;
  iconUri: string | null;
};

type SetCard = {
  scryfallId: string;
  oracleId: string;
  name: string;
  manaCost: string | null;
  typeLine: string;
  rarity: string;
  collectorNumber: string;
  imageUrl: string | null;
};

type PackItem = SetCard & { quantity: number };

const RARITY_STYLE: Record<string, string> = {
  common: "bg-zinc-700 text-zinc-100",
  uncommon: "bg-slate-400 text-slate-900",
  rare: "bg-amber-400 text-amber-950",
  mythic: "bg-orange-600 text-white",
  special: "bg-purple-600 text-white",
  bonus: "bg-purple-600 text-white",
};

function rarityBadge(rarity: string) {
  return RARITY_STYLE[rarity] ?? "bg-zinc-700 text-zinc-100";
}

function rarityLetter(rarity: string) {
  return (rarity[0] ?? "?").toUpperCase();
}

export function PackOpener({ initialSets }: { initialSets: SetOption[] }) {
  const router = useRouter();
  const [setCode, setSetCode] = useState(initialSets[0]?.code ?? "");
  const [pack, setPack] = useState<Map<string, PackItem>>(new Map());
  const [committing, setCommitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const selectedSet = useMemo(
    () => initialSets.find((s) => s.code === setCode) ?? null,
    [initialSets, setCode]
  );

  const packList = useMemo(() => [...pack.values()], [pack]);
  const totalCopies = useMemo(() => packList.reduce((s, p) => s + p.quantity, 0), [packList]);

  const addToPack = useCallback((card: SetCard) => {
    setFlash(null);
    setPack((prev) => {
      const next = new Map(prev);
      const existing = next.get(card.scryfallId);
      next.set(card.scryfallId, { ...card, quantity: (existing?.quantity ?? 0) + 1 });
      return next;
    });
  }, []);

  const setPackQuantity = useCallback((scryfallId: string, quantity: number) => {
    setPack((prev) => {
      const next = new Map(prev);
      if (quantity <= 0) next.delete(scryfallId);
      else {
        const existing = next.get(scryfallId);
        if (existing) next.set(scryfallId, { ...existing, quantity });
      }
      return next;
    });
  }, []);

  const commit = useCallback(async () => {
    if (packList.length === 0 || committing) return;
    setCommitting(true);
    setFlash(null);
    const items = packList.map((p) => ({ scryfallId: p.scryfallId, quantity: p.quantity }));
    const res = await fetch("/api/library/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setCommitting(false);
    if (!res.ok) {
      setFlash("Something went wrong adding to your library. Try again.");
      return;
    }
    const { addedCopies, addedDistinct } = await res.json();
    setPack(new Map());
    setFlash(`Added ${addedCopies} card${addedCopies !== 1 ? "s" : ""} (${addedDistinct} unique) to your library.`);
    router.refresh();
  }, [packList, committing, router]);

  return (
    <div className="flex flex-col h-[calc(100vh-49px)]">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border flex-shrink-0">
        <h1 className="text-sm font-medium">Open Booster Packs</h1>
        <select
          value={setCode}
          onChange={(e) => setSetCode(e.target.value)}
          className="h-7 rounded border border-border bg-background px-2 text-xs max-w-xs"
        >
          {initialSets.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} {s.releasedAt ? `(${s.releasedAt.slice(0, 4)})` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => router.push("/library")}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Library →
        </button>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 flex-shrink-0 border-r border-border overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {selectedSet ? `Cards in ${selectedSet.name}` : "Pick a set"}
          </div>
          {setCode ? (
            <SearchPanel key={setCode} setCode={setCode} onAdd={addToPack} />
          ) : (
            <div className="p-4 text-xs text-muted-foreground">No booster sets available.</div>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              This Pack
            </span>
            <span className="text-xs text-muted-foreground">
              {totalCopies} card{totalCopies !== 1 ? "s" : ""}
            </span>
            <button
              onClick={commit}
              disabled={packList.length === 0 || committing}
              className="ml-auto h-7 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {committing ? "Adding…" : `Add ${totalCopies} to Library`}
            </button>
          </div>

          {flash && (
            <div className="px-3 py-2 text-xs text-emerald-400 border-b border-border bg-emerald-500/5">
              {flash}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {packList.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                Pick the cards you pulled from the list on the left. They&apos;ll collect here, then
                add the whole pack to your library at once.
              </div>
            ) : (
              packList.map((item) => (
                <div
                  key={item.scryfallId}
                  className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 border-b border-border/50"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="w-8 rounded flex-shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-8 h-11 rounded bg-muted flex-shrink-0" />
                  )}
                  <span
                    className={`flex-shrink-0 w-4 h-4 rounded-sm text-[9px] font-bold flex items-center justify-center ${rarityBadge(item.rarity)}`}
                    title={item.rarity}
                  >
                    {rarityLetter(item.rarity)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs truncate block">{item.name}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      #{item.collectorNumber}
                      {item.manaCost ? ` · ${item.manaCost}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setPackQuantity(item.scryfallId, item.quantity - 1)}
                      className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-sm"
                      title={item.quantity <= 1 ? "Remove" : "Decrease"}
                    >
                      −
                    </button>
                    <span className="text-xs font-mono w-5 text-center tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => setPackQuantity(item.scryfallId, item.quantity + 1)}
                      className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-sm"
                      title="Increase"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setPackQuantity(item.scryfallId, 0)}
                      className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-950/30 text-xs ml-1"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchPanel({ setCode, onAdd }: { setCode: string; onAdd: (card: SetCard) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SetCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      if (query) params.set("q", query);
      const res = await fetch(`/api/sets/${setCode}/cards?${params}`);
      if (res.ok) {
        const { cards, hasMore: more } = await res.json();
        setResults((prev) => (page === 1 ? cards : [...prev, ...cards]));
        setHasMore(more);
      }
      setLoading(false);
    }, 250);
    return () => clearTimeout(debounceRef.current ?? undefined);
  }, [setCode, query, page]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-border flex-shrink-0">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Filter cards in this set…"
          className="h-8 text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && results.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">Loading…</div>
        )}
        {!loading && results.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">No cards found</div>
        )}
        {results.map((card) => (
          <button
            key={card.scryfallId}
            onClick={() => onAdd(card)}
            className="w-full flex items-center gap-2 px-3 py-2 border-b border-border/50 hover:bg-muted/40 text-left"
          >
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.imageUrl} alt={card.name} className="w-8 rounded flex-shrink-0" loading="lazy" />
            ) : (
              <div className="w-8 h-11 rounded bg-muted flex-shrink-0" />
            )}
            <span
              className={`flex-shrink-0 w-4 h-4 rounded-sm text-[9px] font-bold flex items-center justify-center ${rarityBadge(card.rarity)}`}
              title={card.rarity}
            >
              {rarityLetter(card.rarity)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{card.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                #{card.collectorNumber} · {card.typeLine}
              </div>
            </div>
            <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold bg-primary/20 text-primary">
              +
            </span>
          </button>
        ))}
        {hasMore && !loading && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40"
          >
            Load more…
          </button>
        )}
      </div>
    </div>
  );
}
