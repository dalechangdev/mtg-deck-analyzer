"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { FullHeightView } from "@/components/ui/shell";
import { SectionHeader, SectionLabel } from "@/components/ui/section-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rarityStyle } from "@/lib/mtg-styles";
import { Button } from "@/components/ui/button";

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

function rarityBadge(rarity: string) {
  return rarityStyle(rarity);
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
    <FullHeightView>
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border flex-shrink-0">
        <h1 className="text-ui font-medium">Open Booster Packs</h1>
        <Select value={setCode} onValueChange={(value) => setSetCode(value as string)}>
          <SelectTrigger size="sm" className="max-w-xs text-body">
            {/* Without a formatter this renders the raw value (the set code). */}
            <SelectValue>
              {(value) => {
                const set = initialSets.find((s) => s.code === value);
                if (!set) return value;
                return `${set.name}${set.releasedAt ? ` (${set.releasedAt.slice(0, 4)})` : ""}`;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {initialSets.map((s) => (
              <SelectItem key={s.code} value={s.code}>
                {s.name} {s.releasedAt ? `(${s.releasedAt.slice(0, 4)})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => router.push("/library")}
          className="ml-auto text-body text-muted-foreground hover:text-foreground"
        >
          Library →
        </button>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 flex-shrink-0 border-r border-border overflow-hidden flex flex-col">
          <SectionHeader variant="panel">
            {selectedSet ? `Cards in ${selectedSet.name}` : "Pick a set"}
          </SectionHeader>
          {setCode ? (
            <SearchPanel key={setCode} setCode={setCode} onAdd={addToPack} />
          ) : (
            <div className="p-4 text-body text-muted-foreground">No booster sets available.</div>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <SectionLabel size="body">This Pack</SectionLabel>
            <span className="text-body text-muted-foreground">
              {totalCopies} card{totalCopies !== 1 ? "s" : ""}
            </span>
            <Button
              onClick={commit}
              disabled={packList.length === 0 || committing}
              size="sm" className="ml-auto"
            >
              {committing ? "Adding…" : `Add ${totalCopies} to Library`}
            </Button>
          </div>

          {flash && (
            <div className="px-3 py-2 text-body text-success border-b border-border bg-success/5">
              {flash}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {packList.length === 0 ? (
              <div className="p-4 text-body text-muted-foreground">
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
                    <img src={item.imageUrl} alt={item.name} className="w-8 rounded-md flex-shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-8 h-11 rounded-md bg-muted flex-shrink-0" />
                  )}
                  <span
                    className={`flex-shrink-0 w-4 h-4 rounded-sm text-micro font-bold flex items-center justify-center ${rarityBadge(item.rarity)}`}
                    title={item.rarity}
                  >
                    {rarityLetter(item.rarity)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-body truncate block">{item.name}</span>
                    <span className="text-label text-muted-foreground font-mono">
                      #{item.collectorNumber}
                      {item.manaCost ? ` · ${item.manaCost}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      onClick={() => setPackQuantity(item.scryfallId, item.quantity - 1)}
                      variant="ghost" size="icon-xs" className="size-5 text-ui"
                      title={item.quantity <= 1 ? "Remove" : "Decrease"}
                    >
                      −
                    </Button>
                    <span className="text-body font-mono w-5 text-center tabular-nums">{item.quantity}</span>
                    <Button
                      onClick={() => setPackQuantity(item.scryfallId, item.quantity + 1)}
                      variant="ghost" size="icon-xs" className="size-5 text-ui"
                      title="Increase"
                    >
                      +
                    </Button>
                    <Button
                      onClick={() => setPackQuantity(item.scryfallId, 0)}
                      variant="ghost" size="icon-xs" className="size-5 ml-1 text-body text-muted-foreground hover:text-danger hover:bg-danger-surface"
                      title="Remove"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </FullHeightView>
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
          className="h-8 text-ui"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && results.length === 0 && (
          <div className="p-4 text-body text-muted-foreground">Loading…</div>
        )}
        {!loading && results.length === 0 && (
          <div className="p-4 text-body text-muted-foreground">No cards found</div>
        )}
        {results.map((card) => (
          <button
            key={card.scryfallId}
            onClick={() => onAdd(card)}
            className="w-full flex items-center gap-2 px-3 py-2 border-b border-border/50 hover:bg-muted/40 text-left"
          >
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.imageUrl} alt={card.name} className="w-8 rounded-md flex-shrink-0" loading="lazy" />
            ) : (
              <div className="w-8 h-11 rounded-md bg-muted flex-shrink-0" />
            )}
            <span
              className={`flex-shrink-0 w-4 h-4 rounded-sm text-micro font-bold flex items-center justify-center ${rarityBadge(card.rarity)}`}
              title={card.rarity}
            >
              {rarityLetter(card.rarity)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-body font-medium truncate">{card.name}</div>
              <div className="text-label text-muted-foreground truncate">
                #{card.collectorNumber} · {card.typeLine}
              </div>
            </div>
            <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-ui font-bold bg-primary/20 text-primary">
              +
            </span>
          </button>
        ))}
        {hasMore && !loading && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="w-full px-3 py-2 text-body text-muted-foreground hover:text-foreground hover:bg-muted/40"
          >
            Load more…
          </button>
        )}
      </div>
    </div>
  );
}
