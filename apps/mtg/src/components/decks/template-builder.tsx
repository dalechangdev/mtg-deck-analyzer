"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FullHeightView } from "@/components/ui/shell";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";
import { toastManager } from "@/lib/toast";
import { REQUIREMENT_STATUS_STYLE } from "@/lib/mtg-styles";
import { CATEGORY_ORDER, getCardCategory, isBasicLand, SLOT_LABEL } from "@/lib/commander";
import {
  evaluateTemplate,
  overrideKey,
  toOverrides,
  type AnalyzedCard,
  type RequirementResult,
  type RoleOverrideRow,
  type Template,
} from "@/lib/deck-template";
import { isManualOnly, type CandidateCard, type CandidatesResponse } from "@/lib/template-candidates";
import { candidatesUrl, deckPageUrl, versionCardsUrl } from "@/lib/deck-api";

const PAGE_SIZE = 40;

interface Props {
  deckId: string;
  versionId: string;
  deckName: string;
  template: Template;
  initialEntries: AnalyzedCard[];
  initialOverrides: RoleOverrideRow[];
}

/**
 * Requirements on the left, suggestions for the selected one in the middle, the
 * deck on the right. Scoring runs client-side with the same evaluator the
 * analysis page uses, so counts move the moment a card lands.
 */
export function TemplateBuilder({
  deckId,
  versionId,
  deckName,
  template,
  initialEntries,
  initialOverrides,
}: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [overrideRows, setOverrideRows] = useState(initialOverrides);
  const overrides = useMemo(() => toOverrides(overrideRows), [overrideRows]);
  const analysis = useMemo(
    () => evaluateTemplate(entries, template, overrides),
    [entries, template, overrides]
  );

  const [roleId, setRoleId] = useState(
    () =>
      evaluateTemplate(initialEntries, template, toOverrides(initialOverrides)).requirements.find(
        (r) => r.status === "under"
      )?.roleId ?? template.requirements[0]?.role.id
  );
  const role = template.requirements.find((r) => r.role.id === roleId)?.role ?? null;
  const manual = role ? isManualOnly(role) : false;

  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [candidates, setCandidates] = useState<CandidateCard[]>([]);
  const [total, setTotal] = useState(0);
  // Bumped when a removal should bring a card back into the list.
  const [refresh, setRefresh] = useState(0);
  // Loading is derived: the list is stale until a response for the current
  // request key lands, so no setState is needed when the request starts.
  const requestKey = JSON.stringify([roleId, query, ownedOnly, refresh]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loading = (roleId !== undefined && loadedKey !== requestKey) || loadingMore;
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    if (!roleId) return;
    const controller = new AbortController();
    fetch(candidatesUrl(deckId, versionId, { roleId, q: query, owned: ownedOnly, limit: PAGE_SIZE }), {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<CandidatesResponse>) : null))
      .then((body) => {
        setCandidates(body?.candidates ?? []);
        setTotal(body?.total ?? 0);
        setLoadedKey(requestKey);
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setCandidates([]);
        setTotal(0);
        setLoadedKey(requestKey);
      });
    return () => controller.abort();
  }, [deckId, versionId, roleId, query, ownedOnly, requestKey]);

  async function loadMore() {
    if (!roleId) return;
    setLoadingMore(true);
    const res = await fetch(
      candidatesUrl(deckId, versionId, {
        roleId,
        q: query,
        owned: ownedOnly,
        offset: candidates.length,
        limit: PAGE_SIZE,
      })
    );
    if (res.ok) {
      const body: CandidatesResponse = await res.json();
      setCandidates((prev) => [...prev, ...body.candidates]);
    }
    setLoadingMore(false);
  }

  function withPending(cardId: string, on: boolean) {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(cardId);
      else next.delete(cardId);
      return next;
    });
  }

  async function add(candidate: CandidateCard) {
    withPending(candidate.cardId, true);
    try {
      const parked = candidate.inSlot
        ? entries.find((e) => e.cardId === candidate.cardId)
        : undefined;

      if (parked) {
        // Already in Potential or Wishlist — the POST would 409, so move it instead.
        const res = await fetch(versionCardsUrl(deckId, versionId, parked.deckCardId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot: "main" }),
        });
        if (!res.ok) throw new Error();
        setEntries((prev) =>
          prev.map((e) => (e.deckCardId === parked.deckCardId ? { ...e, slot: "main" } : e))
        );
      } else {
        const res = await fetch(versionCardsUrl(deckId, versionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: candidate.cardId }),
        });
        if (!res.ok) throw new Error();
        const { id } = await res.json();
        setEntries((prev) => {
          const existing = prev.find((e) => e.deckCardId === id);
          if (existing) {
            return prev.map((e) => (e.deckCardId === id ? { ...e, quantity: e.quantity + 1 } : e));
          }
          return [...prev, toEntry(candidate, id)];
        });
      }

      // A manual-only role can't see the card on its own, so pin it in.
      if (role && manual) {
        const res = await fetch(`/api/decks/${deckId}/roles/${candidate.cardId}/${role.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignment: "INCLUDED" }),
        });
        if (res.ok) {
          setOverrideRows((prev) => [
            ...prev.filter((r) => overrideKey(r.cardId, r.roleId) !== overrideKey(candidate.cardId, role.id)),
            { cardId: candidate.cardId, roleId: role.id, assignment: "INCLUDED" },
          ]);
        }
      }

      if (!isBasicLand(candidate.typeLine)) {
        setCandidates((prev) => prev.filter((c) => c.cardId !== candidate.cardId));
        setTotal((n) => n - 1);
      }
    } catch {
      toastManager.add({ title: `Couldn't add ${candidate.name}`, timeout: 4000 });
    } finally {
      withPending(candidate.cardId, false);
    }
  }

  async function remove(entry: AnalyzedCard) {
    withPending(entry.cardId, true);
    const res = await fetch(versionCardsUrl(deckId, versionId, entry.deckCardId), { method: "DELETE" });
    withPending(entry.cardId, false);
    if (!res.ok) {
      toastManager.add({ title: `Couldn't remove ${entry.name}`, timeout: 4000 });
      return;
    }
    setEntries((prev) =>
      entry.quantity > 1
        ? prev.map((e) => (e.deckCardId === entry.deckCardId ? { ...e, quantity: e.quantity - 1 } : e))
        : prev.filter((e) => e.deckCardId !== entry.deckCardId)
    );
    setRefresh((n) => n + 1);
  }

  const roleNames = useMemo(
    () => new Map(template.requirements.map((r) => [r.role.id, r.role.name])),
    [template]
  );
  const commander = entries.find((e) => e.isCommander) ?? null;
  const mainCount = entries
    .filter((e) => e.slot === "main")
    .reduce((sum, e) => sum + e.quantity, 0);

  return (
    <FullHeightView>
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-lead font-semibold truncate">{deckName}</h1>
          <p className="text-body text-muted-foreground truncate">
            {commander?.name ?? "No commander"} · {template.name}
          </p>
        </div>
        <span
          className={cn(
            "text-ui font-medium tabular-nums",
            mainCount === template.deckSize ? "text-success" : mainCount > template.deckSize ? "text-warning" : ""
          )}
        >
          {mainCount} / {template.deckSize}
        </span>
        <Link href={deckPageUrl(deckId, versionId)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Classic builder
        </Link>
        <Link
          href={deckPageUrl(deckId, versionId, "/analysis")}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Analysis
        </Link>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 flex-shrink-0 border-r border-border overflow-y-auto p-3 space-y-1">
          <SectionLabel className="block px-2 pb-1">Requirements</SectionLabel>
          {analysis.requirements.map((req) => (
            <RequirementButton
              key={req.roleId}
              req={req}
              selected={req.roleId === roleId}
              onSelect={() => setRoleId(req.roleId)}
            />
          ))}
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-shrink-0">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={manual ? "Search for cards that fit your plan…" : `Filter ${role?.name ?? ""} cards…`}
              className="max-w-sm"
            />
            <label className="flex items-center gap-1.5 text-body text-muted-foreground">
              <input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} />
              Owned only
            </label>
            <span className="ml-auto text-body text-muted-foreground tabular-nums">
              {loading ? "Loading…" : `${total} card${total === 1 ? "" : "s"}`}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {manual && (
              <p className="text-body text-muted-foreground mb-3">
                {`${role?.name} cards can't be detected automatically. Anything you add from here is counted toward it for this deck.`}
              </p>
            )}
            {!loading && candidates.length === 0 ? (
              <p className="text-body text-muted-foreground">
                No cards in your commander&apos;s colours match{query.trim() ? " that filter" : ""}.
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
                {candidates.map((c) => (
                  <CandidateTile
                    key={c.cardId}
                    candidate={c}
                    roleNames={roleNames}
                    gapRoleIds={analysis.requirements.filter((r) => r.status === "under").map((r) => r.roleId)}
                    busy={pending.has(c.cardId)}
                    onAdd={() => add(c)}
                  />
                ))}
              </div>
            )}
            {candidates.length < total && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
                  Show more
                </Button>
              </div>
            )}
          </div>
        </main>

        <DeckList
          entries={entries}
          pending={pending}
          onRemove={remove}
        />
      </div>
    </FullHeightView>
  );
}

/** A just-added candidate as a deck row — everything the evaluator reads, tags dropped. */
function toEntry(c: CandidateCard, deckCardId: string): AnalyzedCard {
  return {
    deckCardId,
    isCommander: false,
    quantity: 1,
    slot: "main",
    cardId: c.cardId,
    name: c.name,
    manaCost: c.manaCost,
    cmc: c.cmc,
    typeLine: c.typeLine,
    oracleText: c.oracleText,
    colorIdentity: c.colorIdentity,
    keywords: c.keywords,
    canBeCommander: c.canBeCommander,
    imageUrl: c.imageUrl,
    faces: c.faces,
    themeIds: c.themeIds,
  };
}

function RequirementButton({
  req,
  selected,
  onSelect,
}: {
  req: RequirementResult;
  selected: boolean;
  onSelect: () => void;
}) {
  const style = REQUIREMENT_STATUS_STYLE[req.status];
  const pct = Math.min(100, (req.actual / Math.max(req.targetCount, 1)) * 100);
  const range =
    req.maxCount !== null && (req.minCount !== req.targetCount || req.maxCount !== req.targetCount)
      ? ` (${req.minCount}–${req.maxCount})`
      : "";

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full text-left rounded-md border px-2 py-1.5 space-y-1 transition-colors",
        selected ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/50"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", style.dot)} />
        <span className="text-ui font-medium truncate flex-1">{req.roleName}</span>
        <span className={cn("text-body tabular-nums", style.text)}>
          {req.actual}/{req.targetCount}
          <span className="text-muted-foreground">{range}</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}

function CandidateTile({
  candidate,
  roleNames,
  gapRoleIds,
  busy,
  onAdd,
}: {
  candidate: CandidateCard;
  roleNames: Map<string, string>;
  gapRoleIds: string[];
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="relative group">
        {candidate.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidate.imageUrl}
            alt={candidate.name}
            loading="lazy"
            className="w-full aspect-[488/680] rounded-lg object-cover bg-muted"
          />
        ) : (
          <div className="w-full aspect-[488/680] rounded-lg bg-muted p-2 text-body">{candidate.name}</div>
        )}
        <Button
          size="sm"
          onClick={onAdd}
          disabled={busy}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 shadow-md"
        >
          {busy ? "Adding…" : candidate.inSlot ? "Move to deck" : "Add"}
        </Button>
      </div>
      <div className="text-body font-medium truncate" title={candidate.name}>
        {candidate.name}
      </div>
      <div className="flex flex-wrap gap-1">
        {candidate.owned && (
          <span className="text-micro rounded bg-success-surface-strong text-success px-1.5 py-0.5">Owned</span>
        )}
        {candidate.inSlot && (
          <span className="text-micro rounded bg-muted text-muted-foreground px-1.5 py-0.5">
            In {SLOT_LABEL[candidate.inSlot]}
          </span>
        )}
        {candidate.alsoFills.map((id) => (
          <span
            key={id}
            className={cn(
              "text-micro rounded px-1.5 py-0.5",
              gapRoleIds.includes(id) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}
            title="Also fills this requirement"
          >
            + {roleNames.get(id) ?? id}
          </span>
        ))}
      </div>
    </div>
  );
}

function DeckList({
  entries,
  pending,
  onRemove,
}: {
  entries: AnalyzedCard[];
  pending: Set<string>;
  onRemove: (entry: AnalyzedCard) => void;
}) {
  const commander = entries.find((e) => e.isCommander);
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    cards: entries.filter(
      (e) => e.slot === "main" && !e.isCommander && getCardCategory(e.typeLine) === category
    ),
  })).filter((g) => g.cards.length > 0);

  return (
    <aside className="hidden lg:block w-64 flex-shrink-0 border-l border-border overflow-y-auto p-3 space-y-3">
      {commander && (
        <div>
          <SectionLabel className="block pb-1">Commander</SectionLabel>
          <div className="text-body font-medium truncate">{commander.name}</div>
        </div>
      )}
      {groups.length === 0 && (
        <p className="text-body text-muted-foreground">Cards you add show up here.</p>
      )}
      {groups.map((group) => (
        <div key={group.category}>
          <SectionLabel className="block pb-1">
            {group.category} ({group.cards.reduce((sum, c) => sum + c.quantity, 0)})
          </SectionLabel>
          <ul>
            {group.cards.map((entry) => (
              <li key={entry.deckCardId} className="group flex items-center gap-1 text-body py-0.5">
                <span className="truncate flex-1">
                  {entry.quantity > 1 && <span className="tabular-nums">{entry.quantity}× </span>}
                  {entry.name}
                </span>
                <button
                  onClick={() => onRemove(entry)}
                  disabled={pending.has(entry.cardId)}
                  aria-label={`Remove ${entry.name}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive px-1"
                >
                  −
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
