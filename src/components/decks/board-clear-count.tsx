"use client";

import { useMemo, useState } from "react";
import { getBoardClearProfile } from "@/lib/commander";
import type { DeckEntry, BoardClearMethod, BoardClearScope, BoardClearProfile } from "@/lib/commander";

const METHOD_BADGE: Record<BoardClearMethod, { label: string; cls: string }> = {
  destroy:          { label: "destroy",    cls: "text-red-400 bg-red-950/30" },
  exile:            { label: "exile",      cls: "text-purple-400 bg-purple-950/30" },
  bounce:           { label: "bounce",     cls: "text-sky-400 bg-sky-950/30" },
  damage:           { label: "damage",     cls: "text-orange-400 bg-orange-950/30" },
  "minus-counters": { label: "-X/-X",      cls: "text-emerald-400 bg-emerald-950/30" },
  sacrifice:        { label: "sacrifice",  cls: "text-amber-400 bg-amber-950/30" },
};

const SCOPE_LABEL: Record<BoardClearScope, string> = {
  "creatures":          "creatures",
  "artifacts":          "artifacts",
  "enchantments":       "enchants",
  "planeswalkers":      "walkers",
  "lands":              "lands",
  "tokens":             "tokens",
  "nonland-permanents": "nonland",
  "all-permanents":     "all",
  "colored-permanents": "colored",
};

type CardWithProfile = { entry: DeckEntry; profile: BoardClearProfile };

interface Props {
  entries: DeckEntry[];
}

export function BoardClearCount({ entries }: Props) {
  const [expanded, setExpanded] = useState(false);

  const boardClears = useMemo<CardWithProfile[]>(
    () =>
      entries
        .filter((e) => e.slot === "main" && !e.isCommander)
        .flatMap((e) => {
          const profile = getBoardClearProfile(e);
          return profile ? [{ entry: e, profile }] : [];
        }),
    [entries]
  );

  const count = boardClears.reduce((sum, { entry }) => sum + entry.quantity, 0);

  const methodCounts = useMemo(() => {
    const m = new Map<BoardClearMethod, number>();
    for (const { entry, profile } of boardClears) {
      m.set(profile.method, (m.get(profile.method) ?? 0) + entry.quantity);
    }
    return m;
  }, [boardClears]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Board Clears
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="text-foreground font-medium">{count}</span>{" "}
          card{count !== 1 ? "s" : ""}
          {boardClears.length > 0 && (
            <span className="ml-1 opacity-50">{expanded ? "▲" : "▼"}</span>
          )}
        </button>
      </div>

      {/* Method summary chips — always visible when board clears exist */}
      {boardClears.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {[...methodCounts.entries()].map(([method, n]) => {
            const { label, cls } = METHOD_BADGE[method];
            return (
              <span key={method} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>
                {label}{n > 1 ? ` ×${n}` : ""}
              </span>
            );
          })}
        </div>
      )}

      {/* Expanded card list */}
      {expanded && boardClears.length > 0 && (
        <ul className="mt-2 space-y-2 pl-2 border-l border-border">
          {boardClears.map(({ entry, profile }) => (
            <li key={entry.deckCardId}>
              <div className="text-[11px] text-muted-foreground truncate mb-0.5">
                {entry.quantity > 1 && (
                  <span className="mr-1 font-medium text-foreground">{entry.quantity}×</span>
                )}
                {entry.name}
              </div>
              <div className="flex flex-wrap gap-1">
                <span className={`text-[10px] px-1 py-0.5 rounded ${METHOD_BADGE[profile.method].cls}`}>
                  {METHOD_BADGE[profile.method].label}
                </span>
                {profile.scope.map((s) => (
                  <span key={s} className="text-[10px] px-1 py-0.5 rounded text-muted-foreground bg-muted/40">
                    {SCOPE_LABEL[s]}
                  </span>
                ))}
                {profile.reach === "opponents" && (
                  <span className="text-[10px] px-1 py-0.5 rounded text-emerald-400 bg-emerald-950/30">
                    opp only
                  </span>
                )}
                {profile.reach === "selective" && (
                  <span className="text-[10px] px-1 py-0.5 rounded text-amber-400 bg-amber-950/30">
                    choose
                  </span>
                )}
                {profile.conditionality === "x-cost" && (
                  <span className="text-[10px] px-1 py-0.5 rounded text-sky-400 bg-sky-950/30">
                    X cost
                  </span>
                )}
                {profile.conditionality === "triggered" && (
                  <span className="text-[10px] px-1 py-0.5 rounded text-pink-400 bg-pink-950/30">
                    triggered
                  </span>
                )}
                {profile.bypassesIndestructible && (
                  <span className="text-[10px] px-1 py-0.5 rounded text-zinc-400 bg-zinc-800/50">
                    ↑ indestr.
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
