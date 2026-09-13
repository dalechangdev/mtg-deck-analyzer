"use client";

import { useMemo } from "react";
import { CATEGORY_ORDER, getCardCategory, validateDeck } from "@/lib/commander";
import type { DeckEntry } from "@/lib/commander";
import { SectionLabel } from "@/components/ui/section-header";

interface Props {
  entries: DeckEntry[];
  maybeboardName: string;
  wishlistName: string;
}

/**
 * The deck at a glance — what the dock shows while collapsed, so the deck is
 * still legible without giving up any of the search surface.
 */
export function DeckSummary({ entries, maybeboardName, wishlistName }: Props) {
  const stats = useMemo(() => {
    const validation = validateDeck(entries);
    const commander = entries.find((e) => e.isCommander);
    const mainCards = entries.filter((e) => !e.isCommander && e.slot === "main");
    const maybeCount = entries
      .filter((e) => e.slot === "maybe")
      .reduce((sum, e) => sum + e.quantity, 0);
    const wishlistCount = entries
      .filter((e) => e.slot === "wishlist")
      .reduce((sum, e) => sum + e.quantity, 0);

    const byCategory = CATEGORY_ORDER.map((cat) => ({
      cat,
      count: mainCards
        .filter((e) => getCardCategory(e.typeLine) === cat)
        .reduce((sum, e) => sum + e.quantity, 0),
    })).filter((c) => c.count > 0);

    const spells = mainCards.filter((e) => getCardCategory(e.typeLine) !== "Lands");
    const spellCount = spells.reduce((sum, e) => sum + e.quantity, 0);
    const avgMv = spellCount
      ? spells.reduce((sum, e) => sum + (e.cmc ?? 0) * e.quantity, 0) / spellCount
      : 0;

    const slotted = entries.filter((e) => e.slot === "main");
    const owned = slotted.filter((e) => (e.ownedQuantity ?? 0) >= e.quantity).length;

    return {
      validation,
      commander,
      maybeCount,
      wishlistCount,
      byCategory,
      avgMv,
      owned,
      needed: slotted.length - owned,
      isValid:
        validation.cardCount === 100 &&
        validation.commanderSet &&
        validation.colorViolations.length === 0 &&
        validation.duplicates.length === 0,
    };
  }, [entries]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      {/* Count + legality */}
      <div>
        <div
          className={`text-xl font-mono font-medium ${
            stats.validation.cardCount === 100 ? "text-success" : "text-foreground"
          }`}
        >
          {stats.validation.cardCount}
          <span className="text-muted-foreground text-ui"> / 100</span>
        </div>
        <span
          className={`inline-block mt-1 text-micro px-1.5 py-0.5 rounded-full font-medium ${
            stats.isValid
              ? "bg-success-surface-strong text-success"
              : "bg-warning-surface-strong text-warning"
          }`}
        >
          {stats.isValid ? "Valid" : "Incomplete"}
        </span>
      </div>

      {/* Commander */}
      <div>
        <SectionLabel size="micro" className="block mb-0.5">
          Commander
        </SectionLabel>
        <p className="text-body truncate" title={stats.commander?.name}>
          {stats.commander?.name ?? (
            <span className="text-muted-foreground">Not set</span>
          )}
        </p>
      </div>

      {/* Warnings */}
      {(stats.validation.colorViolations.length > 0 ||
        stats.validation.duplicates.length > 0) && (
        <div className="space-y-0.5">
          {stats.validation.colorViolations.length > 0 && (
            <p className="text-label text-danger">
              ⚠ {stats.validation.colorViolations.length} color violation
              {stats.validation.colorViolations.length !== 1 ? "s" : ""}
            </p>
          )}
          {stats.validation.duplicates.length > 0 && (
            <p className="text-label text-warning">
              ⚠ {stats.validation.duplicates.length} duplicate
              {stats.validation.duplicates.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {/* Type breakdown */}
      {stats.byCategory.length > 0 && (
        <div>
          <SectionLabel size="micro" className="block mb-1">
            Composition
          </SectionLabel>
          <dl className="space-y-0.5">
            {stats.byCategory.map(({ cat, count }) => (
              <div key={cat} className="flex items-baseline justify-between gap-2">
                <dt className="text-label text-muted-foreground truncate">{cat}</dt>
                <dd className="text-label font-mono">{count}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 pt-0.5 border-t border-border/60">
              <dt className="text-label text-muted-foreground">Avg MV</dt>
              <dd className="text-label font-mono">{stats.avgMv.toFixed(2)}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Other slots */}
      {(stats.maybeCount > 0 || stats.wishlistCount > 0) && (
        <div className="space-y-0.5">
          {stats.maybeCount > 0 && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-label text-warning/80 truncate">
                {maybeboardName || "Potential"}
              </span>
              <span className="text-label font-mono text-warning/80">{stats.maybeCount}</span>
            </div>
          )}
          {stats.wishlistCount > 0 && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-label text-highlight/80 truncate">
                {wishlistName || "Wishlist"}
              </span>
              <span className="text-label font-mono text-highlight/80">
                {stats.wishlistCount}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Ownership */}
      {stats.owned + stats.needed > 0 && (
        <div>
          <SectionLabel size="micro" className="block mb-0.5">
            Ownership
          </SectionLabel>
          <p className="text-label text-muted-foreground">
            <span className="text-success font-medium">{stats.owned}</span> owned ·{" "}
            <span className="text-foreground font-medium">{stats.needed}</span> needed
          </p>
        </div>
      )}
    </div>
  );
}
