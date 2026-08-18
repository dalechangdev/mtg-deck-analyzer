"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  evaluateTemplate,
  overrideKey,
  toOverrides,
  type AnalyzedCard,
  type RoleOverrideRow,
  type Template,
} from "@/lib/deck-template";
import { toastManager } from "@/lib/toast";

type Assignment = "INCLUDED" | "EXCLUDED";

const STATUS_STYLE = {
  under: { dot: "bg-amber-400", text: "text-amber-400", bar: "bg-amber-500/70" },
  met: { dot: "bg-emerald-400", text: "text-emerald-400", bar: "bg-emerald-500/70" },
  over: { dot: "bg-sky-400", text: "text-sky-400", bar: "bg-sky-500/70" },
} as const;

interface Props {
  deckId: string;
  deckName: string;
  template: Template;
  templates: { id: string; name: string; isBuiltIn: boolean }[];
  entries: AnalyzedCard[];
  initialOverrides: RoleOverrideRow[];
}

export function DeckAnalysisView({
  deckId,
  deckName,
  template,
  templates,
  entries,
  initialOverrides,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [overrides, setOverrides] = useState<Record<string, Assignment>>(() =>
    Object.fromEntries(
      initialOverrides.map((r) => [overrideKey(r.cardId, r.roleId), r.assignment])
    )
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  // The evaluator is pure, so overrides re-score instantly in the browser and
  // the write to Postgres happens in the background.
  const analysis = useMemo(
    () => evaluateTemplate(entries, template, toOverrides(
      Object.entries(overrides).map(([key, assignment]) => {
        const [cardId, roleId] = key.split(":");
        return { cardId, roleId, assignment };
      })
    )),
    [entries, template, overrides]
  );

  const cardsById = useMemo(
    () => new Map(entries.map((e) => [e.cardId, e])),
    [entries]
  );

  const setOverride = useCallback(
    async (cardId: string, roleId: string, next: Assignment | null) => {
      const key = overrideKey(cardId, roleId);
      const previous = overrides[key];

      setOverrides((prev) => {
        const copy = { ...prev };
        if (next === null) delete copy[key];
        else copy[key] = next;
        return copy;
      });

      const url = `/api/decks/${deckId}/roles/${cardId}/${roleId}`;
      const res =
        next === null
          ? await fetch(url, { method: "DELETE" })
          : await fetch(url, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assignment: next }),
            });

      if (!res.ok) {
        setOverrides((prev) => {
          const copy = { ...prev };
          if (previous === undefined) delete copy[key];
          else copy[key] = previous;
          return copy;
        });
        toastManager.add({
          title: "Failed to save role change",
          description: "Your change was not saved.",
          timeout: 4000,
        });
      }
    },
    [deckId, overrides]
  );

  const switchTemplate = useCallback(
    async (templateId: string) => {
      startTransition(() => {
        router.push(`/decks/${deckId}/analysis?templateId=${templateId}`);
      });
      // Remember the choice so the deck defaults to it next visit.
      await fetch(`/api/decks/${deckId}/templates/${templateId}`, { method: "PUT" });
    },
    [deckId, router]
  );

  const roles = useMemo(
    () => template.requirements.map((r) => r.role),
    [template]
  );

  const overlap = analysis.targetSum - analysis.deckSize;

  return (
    <div className="flex flex-col h-[calc(100vh-49px)]">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border flex-shrink-0">
        <span className="text-sm font-medium">{deckName}</span>
        <span className="text-xs text-muted-foreground">Template Analysis</span>

        <select
          value={template.id}
          onChange={(e) => switchTemplate(e.target.value)}
          className="text-xs bg-transparent border border-border rounded px-2 py-0.5 text-muted-foreground hover:text-foreground"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id} className="bg-background">
              {t.name}
              {t.isBuiltIn ? " (built-in)" : ""}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/templates"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Manage templates
          </Link>
          <Link
            href={`/decks/${deckId}`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Full builder
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/20 flex-shrink-0 text-[11px] text-muted-foreground">
        <span>
          <span className="font-mono font-medium text-foreground">
            {analysis.deckCardCount}
          </span>{" "}
          / {analysis.deckSize} cards
        </span>
        <span className="opacity-40">·</span>
        <span title="Roles overlap — one card can satisfy several requirements, so targets sum past the deck size on purpose.">
          targets sum to{" "}
          <span className="font-mono font-medium text-foreground">{analysis.targetSum}</span>
          {overlap > 0 && (
            <span className="text-amber-400/90"> ({overlap} of double duty)</span>
          )}
        </span>
        <span className="opacity-40">·</span>
        <span>
          <span className="font-mono font-medium text-foreground">
            {analysis.coveredCards}
          </span>{" "}
          cards fill a role
        </span>
        <span className="opacity-40">·</span>
        <span>
          <span className="font-mono font-medium text-foreground">
            {analysis.unassignedCardIds.length}
          </span>{" "}
          unassigned
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Requirements */}
        <ul className="border-b border-border">
          {analysis.requirements.map((req) => {
            const style = STATUS_STYLE[req.status];
            const isOpen = expanded === req.roleId;
            const pct = Math.min(100, (req.actual / Math.max(1, req.targetCount)) * 100);
            const excluded = entries.filter(
              (e) => overrides[overrideKey(e.cardId, req.roleId)] === "EXCLUDED"
            );

            return (
              <li key={req.roleId} className="border-b border-border/50 last:border-b-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : req.roleId)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-muted/40 text-left"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                  <span className="text-xs font-medium w-44 flex-shrink-0">{req.roleName}</span>

                  <span className="font-mono text-xs w-16 flex-shrink-0 text-right">
                    <span className={style.text}>{req.actual}</span>
                    <span className="text-muted-foreground"> / {req.targetCount}</span>
                  </span>

                  <span className="flex-1 h-1.5 bg-muted/60 rounded-full overflow-hidden max-w-md">
                    <span className={`block h-full ${style.bar}`} style={{ width: `${pct}%` }} />
                  </span>

                  <span className={`font-mono text-[11px] w-10 text-right ${style.text}`}>
                    {req.delta > 0 ? `+${req.delta}` : req.delta}
                  </span>

                  <span className="text-[11px] text-muted-foreground w-16 text-right">
                    {req.cardIds.length} card{req.cardIds.length !== 1 ? "s" : ""}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 bg-muted/10">
                    {req.note && (
                      <p className="text-[11px] text-muted-foreground italic py-1.5">{req.note}</p>
                    )}
                    {req.minCount !== req.targetCount || req.maxCount !== null ? (
                      <p className="text-[11px] text-muted-foreground py-1">
                        Accepts {req.minCount}
                        {req.maxCount !== null ? `–${req.maxCount}` : " or more"}
                      </p>
                    ) : null}

                    {req.cardIds.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-2">
                        Nothing fills this role yet.
                      </p>
                    ) : (
                      <ul className="grid grid-cols-2 lg:grid-cols-3 gap-x-4">
                        {req.cardIds.map((cardId) => {
                          const card = cardsById.get(cardId);
                          const manual =
                            overrides[overrideKey(cardId, req.roleId)] === "INCLUDED";
                          return (
                            <li
                              key={cardId}
                              className="group flex items-center gap-1.5 py-0.5 min-w-0"
                            >
                              <span className="text-[11px] truncate flex-1">
                                {card?.name ?? cardId}
                              </span>
                              {manual && (
                                <span
                                  title="Assigned by hand"
                                  className="text-[10px] px-1 rounded bg-sky-950/40 text-sky-400 flex-shrink-0"
                                >
                                  manual
                                </span>
                              )}
                              <button
                                onClick={() => setOverride(cardId, req.roleId, "EXCLUDED")}
                                title={`Doesn't count as ${req.roleName}`}
                                className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-950/30 text-[11px] flex-shrink-0"
                              >
                                ×
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {excluded.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Excluded by hand
                        </span>
                        <ul className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 mt-1">
                          {excluded.map((card) => (
                            <li
                              key={card.cardId}
                              className="group flex items-center gap-1.5 py-0.5 min-w-0"
                            >
                              <span className="text-[11px] truncate flex-1 text-muted-foreground line-through">
                                {card.name}
                              </span>
                              <button
                                onClick={() => setOverride(card.cardId, req.roleId, null)}
                                title="Undo — fall back to automatic classification"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1 rounded border border-border text-muted-foreground hover:text-foreground flex-shrink-0"
                              >
                                undo
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Unassigned — the review queue */}
        {analysis.unassignedCardIds.length > 0 && (
          <div>
            <div className="px-4 py-1.5 bg-muted/20 border-b border-border sticky top-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Fills no role ({analysis.unassignedCardIds.length})
              </span>
            </div>
            <ul>
              {analysis.unassignedCardIds.map((cardId) => {
                const card = cardsById.get(cardId);
                if (!card) return null;
                return (
                  <li
                    key={cardId}
                    className="group flex items-center gap-2 px-4 py-1.5 hover:bg-muted/40 border-b border-border/50"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-xs truncate">{card.name}</span>
                      <span className="text-[11px] text-muted-foreground ml-2">
                        {card.typeLine}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {roles.map((role) => (
                        <button
                          key={role.id}
                          onClick={() => setOverride(cardId, role.id, "INCLUDED")}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-input"
                        >
                          + {role.name}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
