"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { CardDetailModal } from "@/components/cards/card-detail-modal";
import type { CardDetail } from "@/components/cards/card-detail-modal";
import type { DeckEntry } from "@/lib/commander";

type SacrificeRole = "sacrifice-outlet" | "sacrifice-payoff";

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

interface Props {
  deckId: string;
  deckName: string;
  entries: DeckEntry[];
  cardDetails: Record<string, CardDetail>;
  initialRoles: Record<string, SacrificeRole[]>;
}

export function SacrificeView({ deckId, deckName, entries, cardDetails, initialRoles }: Props) {
  const [roles, setRoles] = useState<Record<string, SacrificeRole[]>>(initialRoles);
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);

  const mainEntries = useMemo(
    () => entries.filter((e) => e.slot === "main" && !e.isCommander),
    [entries]
  );

  const byRole = useMemo(() => {
    const outlets: DeckEntry[] = [];
    const payoffs: DeckEntry[] = [];
    for (const e of mainEntries) {
      const r = roles[e.cardId] ?? [];
      if (r.includes("sacrifice-outlet")) outlets.push(e);
      if (r.includes("sacrifice-payoff")) payoffs.push(e);
    }
    return { outlets, payoffs };
  }, [mainEntries, roles]);

  const untagged = useMemo(
    () =>
      mainEntries.filter((e) => {
        const r = roles[e.cardId] ?? [];
        return r.length === 0;
      }),
    [mainEntries, roles]
  );

  const toggle = useCallback(
    async (cardId: string, role: SacrificeRole, add: boolean) => {
      // Optimistic update
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
        // Roll back on failure
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
    },
    []
  );

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
                        : `border-border text-muted-foreground hover:text-foreground`
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
            <span className="text-red-400 font-medium">{byRole.outlets.length}</span> outlet{byRole.outlets.length !== 1 ? "s" : ""}
            <span className="mx-1.5 opacity-40">·</span>
            <span className="text-purple-400 font-medium">{byRole.payoffs.length}</span> payoff{byRole.payoffs.length !== 1 ? "s" : ""}
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
                <div className="px-3 py-1.5 bg-muted/20 border-b border-border flex-shrink-0">
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${style.header}`}>
                    {ROLE_LABEL[role]}s ({cards.length})
                  </span>
                </div>
                {cards.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">None tagged yet.</p>
                ) : (
                  <ul>
                    {cards.map((e) => (
                      <li
                        key={e.deckCardId}
                        className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer"
                        onClick={() => setSelectedCard(cardDetails[e.cardId] ?? null)}
                      >
                        <span className="flex-1 text-xs truncate">{e.name}</span>
                        {/* Show the other role badge if also tagged as it */}
                        {(roles[e.cardId] ?? [])
                          .filter((r) => r !== role)
                          .map((r) => (
                            <span key={r} className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${ROLE_STYLE[r].badge}`}>
                              {ROLE_LABEL[r]}
                            </span>
                          ))}
                        <button
                          onClick={(ev) => { ev.stopPropagation(); toggle(e.cardId, role, false); }}
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

        {/* Untagged cards */}
        {untagged.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-muted/20 border-b border-border sticky top-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Untagged ({untagged.length})
              </span>
            </div>
            <ul>
              {untagged.map((e) => (
                <li
                  key={e.deckCardId}
                  className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 border-b border-border/50 cursor-pointer"
                  onClick={() => setSelectedCard(cardDetails[e.cardId] ?? null)}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-xs truncate block">{e.name}</span>
                    {e.manaCost && (
                      <span className="text-[11px] text-muted-foreground font-mono">{e.manaCost}</span>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    {(["sacrifice-outlet", "sacrifice-payoff"] as SacrificeRole[]).map((role) => (
                      <button
                        key={role}
                        onClick={() => toggle(e.cardId, role, true)}
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
