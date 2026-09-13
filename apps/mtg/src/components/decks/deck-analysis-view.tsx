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
  type RoleOverrides,
  type Template,
} from "@/lib/deck-template";
import { PotentialPool } from "./potential-pool";
import { DeckSteps } from "./deck-steps";
import { toastManager } from "@/lib/toast";
import {
  CardDetailModal,
  type CardDetail,
} from "@/components/cards/card-detail-modal";
import { FullHeightView } from "@/components/ui/shell";
import { SectionLabel } from "@/components/ui/section-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Assignment = "INCLUDED" | "EXCLUDED";

const STATUS_STYLE = {
  under: { dot: "bg-warning", text: "text-warning", bar: "bg-warning/70" },
  met: { dot: "bg-success", text: "text-success", bar: "bg-success/70" },
  over: { dot: "bg-info", text: "text-info", bar: "bg-info/70" },
} as const;

interface Props {
  deckId: string;
  deckName: string;
  template: Template;
  templates: { id: string; name: string; isBuiltIn: boolean }[];
  entries: AnalyzedCard[];
  cardDetails: Record<string, CardDetail>;
  initialOverrides: RoleOverrideRow[];
}

export function DeckAnalysisView({
  deckId,
  deckName,
  template,
  templates,
  entries: initialEntries,
  cardDetails,
  initialOverrides,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Slots move on this screen — promoting out of the potential pile re-scores
  // the template immediately, so the deck lives in state here.
  const [entries, setEntries] = useState<AnalyzedCard[]>(initialEntries);
  const [overrides, setOverrides] = useState<Record<string, Assignment>>(() =>
    Object.fromEntries(
      initialOverrides.map((r) => [overrideKey(r.cardId, r.roleId), r.assignment])
    )
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

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

  const overrideMap = useMemo<RoleOverrides>(
    () => new Map(Object.entries(overrides)),
    [overrides]
  );

  const potentialCards = useMemo(
    () => entries.filter((e) => e.slot === "maybe"),
    [entries]
  );

  const gapRoleIds = useMemo(
    () =>
      new Set(
        analysis.requirements.filter((r) => r.status === "under").map((r) => r.roleId)
      ),
    [analysis]
  );

  // --- Move a card between the potential pile and the main deck ---
  const moveSlot = useCallback(
    async (deckCardId: string, slot: "main" | "maybe") => {
      const previous = entries;
      setEntries((prev) =>
        prev.map((e) => (e.deckCardId === deckCardId ? { ...e, slot } : e))
      );

      const res = await fetch(`/api/decks/${deckId}/cards/${deckCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });

      if (!res.ok) {
        setEntries(previous);
        toastManager.add({
          title: slot === "main" ? "Failed to promote card" : "Failed to move card",
          description: "Your change was not saved.",
          timeout: 4000,
        });
      }
    },
    [deckId, entries]
  );

  const filledRolesByCard = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const req of analysis.requirements) {
      for (const cardId of req.cardIds) {
        const set = map.get(cardId) ?? new Set<string>();
        set.add(req.roleId);
        map.set(cardId, set);
      }
    }
    return map;
  }, [analysis]);

  // Clicking a role in the modal flips it: an unfilled role gets assigned by
  // hand, a filled one gets dropped — clearing the override first when the
  // current state came from one, so automatic classification takes back over.
  const toggleRole = useCallback(
    (cardId: string, roleId: string, filled: boolean) => {
      const current = overrides[overrideKey(cardId, roleId)];
      if (filled) setOverride(cardId, roleId, current === "INCLUDED" ? null : "EXCLUDED");
      else setOverride(cardId, roleId, current === "EXCLUDED" ? null : "INCLUDED");
    },
    [overrides, setOverride]
  );

  const selectedCard = selectedCardId ? cardDetails[selectedCardId] ?? null : null;

  const overlap = analysis.targetSum - analysis.deckSize;

  return (
    <FullHeightView>
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          onClose={() => setSelectedCardId(null)}
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              {roles.map((role) => {
                const filled = filledRolesByCard.get(selectedCard.id)?.has(role.id) ?? false;
                return (
                  <button
                    key={role.id}
                    onClick={() => toggleRole(selectedCard.id, role.id, filled)}
                    className={`text-body px-3 py-1.5 rounded-md border font-medium transition-colors ${
                      filled
                        ? "border-transparent bg-success-surface-strong text-success"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-input"
                    }`}
                  >
                    {filled ? `\u2713 ${role.name}` : `+ ${role.name}`}
                  </button>
                );
              })}
            </div>
          }
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 flex-shrink-0">
        <span className="text-ui font-medium">{deckName}</span>
        <span className="text-body text-muted-foreground">Template Analysis</span>

        <Select
          value={template.id}
          onValueChange={(value) => switchTemplate(value as string)}
        >
          <SelectTrigger size="sm" className="text-body text-muted-foreground">
            <SelectValue>
              {(value) => {
                const t = templates.find((t) => t.id === value);
                if (!t) return value;
                return `${t.name}${t.isBuiltIn ? " (built-in)" : ""}`;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.isBuiltIn ? " (built-in)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/templates"
            className="text-body text-muted-foreground hover:text-foreground transition-colors"
          >
            Manage templates
          </Link>
          <Link
            href={`/decks/${deckId}`}
            className="text-body text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Full builder
          </Link>
        </div>
      </div>

      <DeckSteps
        deckId={deckId}
        current="analysis"
        commanderName={entries.find((e) => e.isCommander)?.name ?? null}
        potentialCount={potentialCards.reduce((sum, e) => sum + e.quantity, 0)}
        mainCount={analysis.deckCardCount + (entries.some((e) => e.isCommander) ? 1 : 0)}
        deckSize={analysis.deckSize}
      />

      {/* Summary */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/20 flex-shrink-0 text-label text-muted-foreground">
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
            <span className="text-warning/90"> ({overlap} of double duty)</span>
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

      <div className="flex-1 flex overflow-hidden min-h-0">
      <div className="flex-1 min-w-0 overflow-y-auto">
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
                  <span className="text-body font-medium w-44 flex-shrink-0">{req.roleName}</span>

                  <span className="font-mono text-body w-16 flex-shrink-0 text-right">
                    <span className={style.text}>{req.actual}</span>
                    <span className="text-muted-foreground"> / {req.targetCount}</span>
                  </span>

                  <span className="flex-1 h-1.5 bg-muted/60 rounded-full overflow-hidden max-w-md">
                    <span className={`block h-full ${style.bar}`} style={{ width: `${pct}%` }} />
                  </span>

                  <span className={`font-mono text-label w-10 text-right ${style.text}`}>
                    {req.delta > 0 ? `+${req.delta}` : req.delta}
                  </span>

                  <span className="text-label text-muted-foreground w-16 text-right">
                    {req.cardIds.length} card{req.cardIds.length !== 1 ? "s" : ""}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 bg-muted/10">
                    {req.note && (
                      <p className="text-label text-muted-foreground italic py-1.5">{req.note}</p>
                    )}
                    {req.minCount !== req.targetCount || req.maxCount !== null ? (
                      <p className="text-label text-muted-foreground py-1">
                        Accepts {req.minCount}
                        {req.maxCount !== null ? `–${req.maxCount}` : " or more"}
                      </p>
                    ) : null}

                    {req.cardIds.length === 0 ? (
                      <p className="text-label text-muted-foreground py-2">
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
                              <span className="text-label truncate flex-1">
                                {card?.name ?? cardId}
                              </span>
                              {manual && (
                                <span
                                  title="Assigned by hand"
                                  className="text-micro px-1 rounded-md bg-info-surface-strong text-info flex-shrink-0"
                                >
                                  manual
                                </span>
                              )}
                              <button
                                onClick={() => setOverride(cardId, req.roleId, "EXCLUDED")}
                                title={`Doesn't count as ${req.roleName}`}
                                className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded-md flex items-center justify-center text-muted-foreground hover:text-danger hover:bg-danger-surface text-label flex-shrink-0"
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
                        <SectionLabel size="micro" className="font-normal">
                          Excluded by hand
                        </SectionLabel>
                        <ul className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 mt-1">
                          {excluded.map((card) => (
                            <li
                              key={card.cardId}
                              className="group flex items-center gap-1.5 py-0.5 min-w-0"
                            >
                              <span className="text-label truncate flex-1 text-muted-foreground line-through">
                                {card.name}
                              </span>
                              <button
                                onClick={() => setOverride(card.cardId, req.roleId, null)}
                                title="Undo — fall back to automatic classification"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-micro px-1 rounded-md border border-border text-muted-foreground hover:text-foreground flex-shrink-0"
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
              <SectionLabel>
                Fills no role ({analysis.unassignedCardIds.length})
              </SectionLabel>
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
                    <button
                      onClick={() => setSelectedCardId(cardId)}
                      disabled={!cardDetails[cardId]}
                      title="View card details"
                      className="flex-1 min-w-0 text-left cursor-pointer disabled:cursor-default"
                    >
                      <span className="text-body truncate">{card.name}</span>
                      <span className="text-label text-muted-foreground ml-2">
                        {card.typeLine}
                      </span>
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {roles.map((role) => (
                        <button
                          key={role.id}
                          onClick={() => setOverride(cardId, role.id, "INCLUDED")}
                          className="text-micro px-1.5 py-0.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-input"
                        >
                          + {role.name}
                        </button>
                      ))}
                      <button
                        onClick={() => moveSlot(card.deckCardId, "maybe")}
                        title="Send back to the potential pile"
                        className="text-micro px-1.5 py-0.5 rounded-md border border-warning-border text-warning hover:bg-warning-surface-strong"
                      >
                        → potential
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

        {/* ── Potential pile: the pool this stage cuts down to a deck ── */}
        <div className="w-96 flex-shrink-0 border-l border-border overflow-hidden">
          <PotentialPool
            cards={potentialCards}
            roles={roles}
            overrides={overrideMap}
            gapRoleIds={gapRoleIds}
            onPromote={(card) => moveSlot(card.deckCardId, "main")}
            onInspect={(cardId) => setSelectedCardId(cardId)}
            hasDetail={(cardId) => Boolean(cardDetails[cardId])}
          />
        </div>
      </div>
    </FullHeightView>
  );
}
