"use client";

import { useMemo, useState } from "react";
import {
  fillsRole,
  type AnalyzedCard,
  type Role,
  type RoleOverrides,
} from "@/lib/deck-template";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";

interface Props {
  /** Everything sitting in the potential pile. */
  cards: AnalyzedCard[];
  roles: Role[];
  overrides: RoleOverrides;
  /** Roles the deck is still short on — what promoting should aim at. */
  gapRoleIds: Set<string>;
  onPromote: (card: AnalyzedCard) => void;
  onInspect: (cardId: string) => void;
  hasDetail: (cardId: string) => boolean;
}

type Sort = "name" | "cmc";

/**
 * The theorizing pile, read through the template: each card is tagged with the
 * roles it would fill, so cutting 150 potentials down to a deck is a matter of
 * promoting the ones that close a gap.
 */
export function PotentialPool({
  cards,
  roles,
  overrides,
  gapRoleIds,
  onPromote,
  onInspect,
  hasDetail,
}: Props) {
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | "all" | "gaps">("all");
  const [sort, setSort] = useState<Sort>("name");

  // Which roles each potential card would fill if it were promoted.
  const rolesByCard = useMemo(() => {
    const map = new Map<string, Role[]>();
    for (const card of cards) {
      map.set(card.cardId, roles.filter((role) => fillsRole(card, role, overrides)));
    }
    return map;
  }, [cards, roles, overrides]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return cards
      .filter((card) => {
        if (q && !card.name.toLowerCase().includes(q) && !card.typeLine.toLowerCase().includes(q)) {
          return false;
        }
        const filled = rolesByCard.get(card.cardId) ?? [];
        if (roleFilter === "all") return true;
        if (roleFilter === "gaps") return filled.some((r) => gapRoleIds.has(r.id));
        return filled.some((r) => r.id === roleFilter);
      })
      .sort((a, b) =>
        sort === "cmc"
          ? (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name)
      );
  }, [cards, filter, roleFilter, rolesByCard, gapRoleIds, sort]);

  const gapRoles = roles.filter((r) => gapRoleIds.has(r.id));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SectionHeader variant="toolbar" className="flex-shrink-0">
        <span className="flex-1">Potential ({cards.length})</span>
        <button
          onClick={() => setSort(sort === "name" ? "cmc" : "name")}
          title="Change sort order"
          className="text-micro font-normal normal-case tracking-normal px-1.5 py-0.5 rounded-md border border-border text-muted-foreground hover:text-foreground"
        >
          {sort === "name" ? "A–Z" : "by MV"}
        </button>
      </SectionHeader>

      <div className="px-3 py-2 space-y-2 border-b border-border flex-shrink-0">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter potential…"
          className="h-7 text-body"
        />
        <div className="flex flex-wrap gap-1">
          <FilterChip active={roleFilter === "all"} onClick={() => setRoleFilter("all")}>
            All
          </FilterChip>
          {gapRoles.length > 0 && (
            <FilterChip
              active={roleFilter === "gaps"}
              onClick={() => setRoleFilter("gaps")}
              tone="warning"
            >
              Fills a gap
            </FilterChip>
          )}
          {gapRoles.map((role) => (
            <FilterChip
              key={role.id}
              active={roleFilter === role.id}
              onClick={() => setRoleFilter(role.id)}
            >
              {role.name}
            </FilterChip>
          ))}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <li className="px-3 py-4 text-body text-muted-foreground">
            {cards.length === 0
              ? "Nothing in the potential pile yet — add cards from the builder."
              : "No potential cards match this filter."}
          </li>
        )}
        {visible.map((card) => {
          const filled = rolesByCard.get(card.cardId) ?? [];
          const fillsGap = filled.some((r) => gapRoleIds.has(r.id));
          return (
            <li
              key={card.cardId}
              className="group px-3 py-1.5 border-b border-border/50 hover:bg-muted/40"
            >
              <div className="flex items-start gap-2">
                <button
                  onClick={() => onInspect(card.cardId)}
                  disabled={!hasDetail(card.cardId)}
                  title="View card details"
                  className="flex-1 min-w-0 text-left cursor-pointer disabled:cursor-default"
                >
                  <span className="text-body truncate block">{card.name}</span>
                  <span className="text-micro text-muted-foreground truncate block">
                    {card.manaCost && <span className="font-mono mr-1">{card.manaCost}</span>}
                    {card.typeLine}
                  </span>
                </button>
                <button
                  onClick={() => onPromote(card)}
                  title="Move to the main deck"
                  className={`flex-shrink-0 text-micro px-1.5 py-0.5 rounded-md border transition-colors ${
                    fillsGap
                      ? "border-success-border text-success hover:bg-success-surface-strong"
                      : "border-border text-muted-foreground hover:border-success-border hover:text-success"
                  }`}
                >
                  → main
                </button>
              </div>
              {filled.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {filled.map((role) => (
                    <span
                      key={role.id}
                      className={`text-micro px-1 py-0.5 rounded-md ${
                        gapRoleIds.has(role.id)
                          ? "bg-warning-surface-strong text-warning"
                          : "bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      {role.name}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  tone = "default",
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "default" | "warning";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-micro px-1.5 py-0.5 rounded-full border transition-colors ${
        active
          ? tone === "warning"
            ? "border-warning-border bg-warning-surface-strong text-warning"
            : "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
