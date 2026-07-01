"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import type { CardDetail } from "@/components/cards/card-detail-modal";
import type { DeckEntry } from "@/lib/commander";
import type { LibraryCard } from "@/components/decks/builder-view";

type SacrificeRole = "sacrifice-outlet" | "sacrifice-payoff";
type CardSource = "main" | "maybe" | "library";

type DisplayEntry = {
  key: string;
  cardId: string;
  name: string;
  manaCost: string | null;
  source: CardSource;
};

const ROLE_LABEL: Record<SacrificeRole, string> = {
  "sacrifice-outlet": "Outlet",
  "sacrifice-payoff": "Payoff",
};

const ROLE_STYLE: Record<SacrificeRole, { header: string; badge: string; addBtn: string }> = {
  "sacrifice-outlet": {
    header: "text-red-400/80",
    badge: "text-red-400 bg-red-950/30",
    addBtn: "border-red-600/50 text-red-400 hover:bg-red-950/40",
  },
  "sacrifice-payoff": {
    header: "text-purple-400/80",
    badge: "text-purple-400 bg-purple-950/30",
    addBtn: "border-purple-600/50 text-purple-400 hover:bg-purple-950/40",
  },
};

const SOURCE_BADGE: Record<CardSource, string | null> = {
  main: null,
  maybe: "text-amber-400/80 bg-amber-950/20",
  library: "text-sky-400/80 bg-sky-950/20",
};

interface Props {
  deckId: string;
  deckName: string;
  entries: DeckEntry[];
  libraryCards: LibraryCard[];
  cardDetails: Record<string, CardDetail>;
  initialRoles: Record<string, SacrificeRole[]>;
}

export function SacrificeView({
  deckId,
  deckName,
  entries,
  libraryCards,
  cardDetails,
  initialRoles,
}: Props) {
  const [roles, setRoles] = useState<Record<string, SacrificeRole[]>>(initialRoles);
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);

  const deckCardIds = useMemo(() => new Set(entries.map((e) => e.cardId)), [entries]);

  const allEntries = useMemo<DisplayEntry[]>(() => {
    const deck = entries
      .filter((e) => e.slot !== "wishlist" && !e.isCommander)
      .map((e) => ({
        key: e.deckCardId,
        cardId: e.cardId,
        name: e.name,
        manaCost: e.manaCost,
        source: e.slot as "main" | "maybe",
      }));

    const lib = libraryCards
      .filter((lc) => !deckCardIds.has(lc.cardId))
      .map((lc) => ({
        key: lc.libraryCardId,
        cardId: lc.cardId,
        name: lc.name,
        manaCost: lc.manaCost,
        source: "library" as const,
      }));

    return [...deck, ...lib];
  }, [entries, libraryCards, deckCardIds]);

  const byRole = useMemo(() => {
    const outlets: DisplayEntry[] = [];
    const payoffs: DisplayEntry[] = [];
    for (const item of allEntries) {
      const r = roles[item.cardId] ?? [];
      if (r.includes("sacrifice-outlet")) outlets.push(item);
      if (r.includes("sacrifice-payoff")) payoffs.push(item);
    }
    return { outlets, payoffs };
  }, [allEntries, roles]);

  const untagged = useMemo(
    () => allEntries.filter((item) => (roles[item.cardId] ?? []).length === 0),
    [allEntries, roles]
  );

  const toggle = useCallback(async (cardId: string, role: SacrificeRole, add: boolean) => {
    setRoles((prev) => {
      const current = prev[cardId] ?? [];
      return {
        ...prev,
        [cardId]: add
          ? [...new Set([...current, role])]
          : current.filter((r) => r !== role),
      };
    });

    const method = add ? "PUT" : "DELETE";
    const res = await fetch(`/api/cards/${cardId}/themes/${role}`, { method });
    if (!res.ok) {
      setRoles((prev) => {
        const current = prev[cardId] ?? [];
        return {
          ...prev,
          [cardId]: add
            ? current.filter((r) => r !== role)
            : [...new Set([...current, role])],
        };
      });
    }
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-49px)]">
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          actions={
            <div className="flex items-center gap-2">
              {(["sacrifice-outlet", "sacrifice-payoff"] as SacrificeRole[]).map((role) => {
                const tagged = (roles[selectedCard.id] ?? []).includes(role);
                const style = ROLE_STYLE[role];
                return (
                  <button
                    key={role}
                    onClick={() => toggle(selectedCard.id, role, !tagged)}
                    className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors ${
                      tagged
                        ? `${style.badge} border-transparent`
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tagged ? `✓ ${ROLE_LABEL[role]}` : `+ ${ROLE_LABEL[role]}`}
                  </button>
                );
              })}
            </div>
          }
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border flex-shrink-0">
        <span className="text-sm font-medium">{deckName}</span>
        <span className="text-xs text-muted-foreground">Sacrifice Engine</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            <span className="text-red-400 font-medium">{byRole.outlets.length}</span>{" "}
            outlet{byRole.outlets.length !== 1 ? "s" : ""}
            <span className="mx-1.5 opacity-40">·</span>
            <span className="text-purple-400 font-medium">{byRole.payoffs.length}</span>{" "}
            payoff{byRole.payoffs.length !== 1 ? "s" : ""}
          </span>
          <Link
            href={`/decks/${deckId}`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Full builder
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* Tagged columns */}
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
          {(["sacrifice-outlet", "sacrifice-payoff"] as SacrificeRole[]).map((role) => {
            const cards = role === "sacrifice-outlet" ? byRole.outlets : byRole.payoffs;
            const style = ROLE_STYLE[role];
            return (
              <div key={role} className="flex flex-col">
                <div className="px-3 py-1.5 bg-muted/20 border-b border-border">
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${style.header}`}>
                    {ROLE_LABEL[role]}s ({cards.length})
                  </span>
                </div>
                {cards.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">None tagged yet.</p>
                ) : (
                  <ul>
                    {cards.map((item) => (
                      <li
                        key={item.key}
                        className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer"
                        onClick={() => setSelectedCard(cardDetails[item.cardId] ?? null)}
                      >
                        <span className="flex-1 text-xs truncate">{item.name}</span>
                        {SOURCE_BADGE[item.source] && (
                          <span className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${SOURCE_BADGE[item.source]}`}>
                            {item.source}
                          </span>
                        )}
                        {(roles[item.cardId] ?? [])
                          .filter((r) => r !== role)
                          .map((r) => (
                            <span key={r} className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${ROLE_STYLE[r].badge}`}>
                              {ROLE_LABEL[r]}
                            </span>
                          ))}
                        <button
                          onClick={(ev) => { ev.stopPropagation(); toggle(item.cardId, role, false); }}
                          title={`Remove ${ROLE_LABEL[role]} tag`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-950/30 text-xs flex-shrink-0"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Untagged */}
        {untagged.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-muted/20 border-b border-border sticky top-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Untagged ({untagged.length})
              </span>
            </div>
            <ul>
              {untagged.map((item) => (
                <li
                  key={item.key}
                  className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 border-b border-border/50 cursor-pointer"
                  onClick={() => setSelectedCard(cardDetails[item.cardId] ?? null)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs truncate">{item.name}</span>
                      {SOURCE_BADGE[item.source] && (
                        <span className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${SOURCE_BADGE[item.source]}`}>
                          {item.source}
                        </span>
                      )}
                    </div>
                    {item.manaCost && (
                      <span className="text-[11px] text-muted-foreground font-mono">{item.manaCost}</span>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    {(["sacrifice-outlet", "sacrifice-payoff"] as SacrificeRole[]).map((role) => (
                      <button
                        key={role}
                        onClick={() => toggle(item.cardId, role, true)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${ROLE_STYLE[role].addBtn}`}
                      >
                        + {ROLE_LABEL[role]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}
