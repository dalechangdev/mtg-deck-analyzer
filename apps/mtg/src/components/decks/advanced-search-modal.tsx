"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MANA_CHIP, SEARCH_COLOR_LABELS } from "@/lib/mtg-styles";
import {
  COLOR_MODE_LABELS,
  EMPTY_FACETS,
  MATCH_MODE_LABELS,
  OWNED_LABELS,
  RARITIES,
  RARITY_LABELS,
  SEARCH_COLORS,
  SORT_FIELD_LABELS,
  STAT_FIELD_LABELS,
  STAT_OP_LABELS,
  type CardFacets,
  type CardQuery,
  type ColorMode,
  type MatchMode,
  type OwnedMode,
  type SortField,
  type StatField,
  type StatOp,
} from "@/lib/card-search";

interface Props {
  open: boolean;
  /** The query currently driving the results panel. */
  query: CardQuery;
  /** What "Reset" returns to — the panel's starting point, not a blank slate. */
  base: CardQuery;
  onClose: () => void;
  onApply: (query: CardQuery) => void;
  /** Live count for the draft query, so you can see a filter bite before applying. */
  previewCount?: (query: CardQuery) => Promise<number>;
}

/**
 * Scryfall's advanced search, over the local card pool.
 *
 * The sections mirror scryfall.com/advanced field for field, except for the
 * four our Card table has no data for (prices, artist, flavour text and
 * language) and Scryfall's per-format legality dropdown — we only store
 * Commander legality. Card themes stand in for Scryfall's "criteria", and
 * library ownership is an extra the local collection makes possible.
 *
 * The draft lives here and is only handed back on Search, so a half-built
 * query never re-runs the results behind the modal.
 */
export function AdvancedSearchModal({
  open,
  query,
  base,
  onClose,
  onApply,
  previewCount,
}: Props) {
  const [draft, setDraft] = useState<CardQuery>(query);
  const [facets, setFacets] = useState<CardFacets>(EMPTY_FACETS);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  // Re-seed the draft each time the modal opens, discarding an abandoned edit.
  // Adjusted during render rather than in an effect, so the first paint after
  // opening already shows the live query.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(query);
  }

  useEffect(() => {
    if (!open || facets.sets.length > 0) return;
    let cancelled = false;
    fetch("/api/cards/facets")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CardFacets | null) => {
        if (data && !cancelled) setFacets(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, facets.sets.length]);

  // Debounced "how many cards would this find?" as the draft changes.
  useEffect(() => {
    if (!open || !previewCount) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setCounting(true);
      previewCount(draft)
        .then((total) => {
          if (!cancelled) setCount(total);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setCounting(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, open, previewCount]);

  function patch(changes: Partial<CardQuery>) {
    setDraft((prev) => ({ ...prev, ...changes }));
  }

  const typeOptions = useMemo(
    () => [...facets.types, ...facets.subtypes],
    [facets.types, facets.subtypes]
  );

  const oracleBoxes = draft.oracle.length > 0 ? draft.oracle : [""];

  return (
    <Modal open={open} onClose={onClose} size="lg" className="max-w-4xl">
      <ModalHeader
        title="Advanced search"
        description="Every field is optional — fill in the ones you care about."
      />

      <ModalBody className="px-5 py-4 space-y-4">
        <Field label="Card Name" hint="Any words in the name, e.g. Fire">
          <Input
            autoFocus
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Search for a card name"
          />
        </Field>

        <Field label="Text" hint="Rules text, e.g. “draw a card”. Split and modal cards match on either face.">
          <div className="space-y-1.5">
            {oracleBoxes.map((term, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <Input
                  value={term}
                  onChange={(e) => {
                    const next = [...oracleBoxes];
                    next[index] = e.target.value;
                    patch({ oracle: next });
                  }}
                  placeholder="Any text, e.g. “enters tapped”"
                />
                {oracleBoxes.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove text box"
                    onClick={() => patch({ oracle: oracleBoxes.filter((_, i) => i !== index) })}
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => patch({ oracle: [...oracleBoxes, ""] })}
              >
                + Add another text box
              </Button>
              {oracleBoxes.length > 1 && (
                <ModeSelect
                  value={draft.oracleMode}
                  onChange={(oracleMode) => patch({ oracleMode })}
                />
              )}
            </div>
          </div>
        </Field>

        <Field label="Type Line" hint="Type, supertype or subtype. Type your own or pick from the list.">
          <TokenPicker
            values={draft.types}
            options={typeOptions}
            placeholder="Choose or type a card type"
            allowFreeText
            onChange={(types) => patch({ types })}
            trailing={
              draft.types.length > 1 ? (
                <ModeSelect value={draft.typeMode} onChange={(typeMode) => patch({ typeMode })} />
              ) : null
            }
          />
        </Field>

        <Field label="Colors" hint="The card's own colors.">
          <ColorPicker
            selected={draft.colors}
            mode={draft.colorMode}
            onChange={(colors) => patch({ colors })}
            onModeChange={(colorMode) => patch({ colorMode })}
          />
        </Field>

        <Field label="Commander" hint="Color identity — what a commander at the head of the deck allows.">
          <ColorPicker
            selected={draft.identity}
            mode={draft.identityMode}
            onChange={(identity) => patch({ identity })}
            onModeChange={(identityMode) => patch({ identityMode })}
          />
        </Field>

        <Field label="Mana Cost" hint="Any mana symbols, e.g. {W}{W} — or just WW. Repeats count.">
          <Input
            value={draft.manaCost}
            onChange={(e) => patch({ manaCost: e.target.value })}
            placeholder="{2}{U}{U}"
            className="font-mono"
          />
        </Field>

        <Field label="Stats" hint="Cards without that stat — a land's power, say — never match.">
          <div className="space-y-1.5">
            {draft.stats.map((stat, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <Select
                  value={stat.field}
                  onValueChange={(value) =>
                    patch({
                      stats: draft.stats.map((s, i) =>
                        i === index ? { ...s, field: value as StatField } : s
                      ),
                    })
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue>
                      {(value) => STAT_FIELD_LABELS[value as StatField]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STAT_FIELD_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={stat.op}
                  onValueChange={(value) =>
                    patch({
                      stats: draft.stats.map((s, i) =>
                        i === index ? { ...s, op: value as StatOp } : s
                      ),
                    })
                  }
                >
                  <SelectTrigger className="w-16">
                    <SelectValue>{(value) => STAT_OP_LABELS[value as StatOp]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STAT_OP_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={stat.value}
                  inputMode="numeric"
                  onChange={(e) =>
                    patch({
                      stats: draft.stats.map((s, i) =>
                        i === index ? { ...s, value: e.target.value } : s
                      ),
                    })
                  }
                  placeholder="3"
                  className="w-24"
                />

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove stat"
                  onClick={() => patch({ stats: draft.stats.filter((_, i) => i !== index) })}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                patch({ stats: [...draft.stats, { field: "cmc", op: "eq", value: "" }] })
              }
            >
              + Add another stat
            </Button>
          </div>
        </Field>

        <Field label="Rarity" hint="Matches if any printing has that rarity.">
          <div className="flex flex-wrap gap-1.5">
            {RARITIES.map((rarity) => (
              <ChipToggle
                key={rarity}
                active={draft.rarities.includes(rarity)}
                onClick={() =>
                  patch({
                    rarities: draft.rarities.includes(rarity)
                      ? draft.rarities.filter((r) => r !== rarity)
                      : [...draft.rarities, rarity],
                  })
                }
              >
                {RARITY_LABELS[rarity]}
              </ChipToggle>
            ))}
          </div>
        </Field>

        <Field label="Sets">
          <TokenPicker
            values={draft.sets}
            options={facets.sets.map((set) => ({
              value: set.code,
              label: `${set.name} (${set.code.toUpperCase()})`,
            }))}
            placeholder="Choose a set"
            onChange={(sets) => patch({ sets })}
            renderChip={(code) =>
              facets.sets.find((s) => s.code === code)?.name ?? code.toUpperCase()
            }
          />
        </Field>

        <Field label="Keywords" hint="Keyword abilities as printed, e.g. Flying, Landfall.">
          <TokenPicker
            values={draft.keywords}
            options={facets.keywords}
            placeholder="Choose a keyword"
            onChange={(keywords) => patch({ keywords })}
            trailing={
              draft.keywords.length > 1 ? (
                <ModeSelect
                  value={draft.keywordMode}
                  onChange={(keywordMode) => patch({ keywordMode })}
                />
              ) : null
            }
          />
        </Field>

        {facets.themes.length > 0 && (
          <Field label="Themes" hint="Your own card tags, the way Scryfall uses criteria.">
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {facets.themes.map((theme) => (
                  <ChipToggle
                    key={theme.id}
                    active={draft.themes.includes(theme.id)}
                    onClick={() =>
                      patch({
                        themes: draft.themes.includes(theme.id)
                          ? draft.themes.filter((t) => t !== theme.id)
                          : [...draft.themes, theme.id],
                      })
                    }
                  >
                    {theme.name}
                  </ChipToggle>
                ))}
              </div>
              {draft.themes.length > 1 && (
                <ModeSelect value={draft.themeMode} onChange={(themeMode) => patch({ themeMode })} />
              )}
            </div>
          </Field>
        )}

        <Field label="Legality" hint="Commander is the only format this app tracks.">
          <div className="flex flex-wrap gap-1.5">
            <ChipToggle
              active={draft.commanderLegal}
              onClick={() => patch({ commanderLegal: !draft.commanderLegal })}
            >
              Commander legal
            </ChipToggle>
            <ChipToggle
              active={draft.canBeCommander}
              onClick={() => patch({ canBeCommander: !draft.canBeCommander })}
            >
              Can be a commander
            </ChipToggle>
          </div>
        </Field>

        <Field label="Collection">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(OWNED_LABELS) as OwnedMode[]).map((value) => (
              <ChipToggle
                key={value}
                active={draft.owned === value}
                onClick={() => patch({ owned: value })}
              >
                {OWNED_LABELS[value]}
              </ChipToggle>
            ))}
          </div>
        </Field>

        <Field label="Sort">
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              value={draft.sort}
              onValueChange={(value) => patch({ sort: value as SortField })}
            >
              <SelectTrigger className="w-44">
                <SelectValue>{(value) => SORT_FIELD_LABELS[value as SortField]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_FIELD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ChipToggle active={draft.dir === "asc"} onClick={() => patch({ dir: "asc" })}>
              Ascending
            </ChipToggle>
            <ChipToggle active={draft.dir === "desc"} onClick={() => patch({ dir: "desc" })}>
              Descending
            </ChipToggle>
          </div>
        </Field>
      </ModalBody>

      <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-5 py-3">
        <span className="text-label text-muted-foreground">
          {counting || count === null
            ? "Counting…"
            : `${count.toLocaleString()} card${count === 1 ? "" : "s"} match`}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDraft(base)}>
          Reset
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onApply(draft)}>
          Search
        </Button>
      </div>
    </Modal>
  );
}

/** One labelled row: caption on the left, controls on the right. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-4 gap-y-1 sm:grid-cols-[9rem_1fr]">
      <SectionLabel className="pt-2">{label}</SectionLabel>
      <div className="min-w-0 space-y-1">
        {children}
        {hint && <p className="text-label text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-label font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-input hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ModeSelect({
  value,
  onChange,
}: {
  value: MatchMode;
  onChange: (mode: MatchMode) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as MatchMode)}>
      <SelectTrigger size="sm" className="w-32 text-body text-muted-foreground">
        <SelectValue>{(v) => MATCH_MODE_LABELS[v as MatchMode]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(MATCH_MODE_LABELS).map(([mode, label]) => (
          <SelectItem key={mode} value={mode}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ColorPicker({
  selected,
  mode,
  onChange,
  onModeChange,
}: {
  selected: string[];
  mode: ColorMode;
  onChange: (colors: string[]) => void;
  onModeChange: (mode: ColorMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        {SEARCH_COLORS.map((color) => {
          const active = selected.includes(color);
          return (
            <button
              key={color}
              type="button"
              aria-pressed={active}
              title={SEARCH_COLOR_LABELS[color]}
              onClick={() =>
                onChange(
                  active ? selected.filter((c) => c !== color) : [...selected, color]
                )
              }
              className={`h-7 w-7 rounded-full border-2 text-body font-bold transition-all ${MANA_CHIP[color]} ${
                active
                  ? "scale-110 ring-2 ring-foreground/30 ring-offset-1 ring-offset-popover"
                  : "opacity-40 hover:opacity-70"
              }`}
            >
              {color}
            </button>
          );
        })}
      </div>
      <Select value={mode} onValueChange={(next) => onModeChange(next as ColorMode)}>
        <SelectTrigger size="sm" className="text-body text-muted-foreground">
          <SelectValue>{(value) => COLOR_MODE_LABELS[value as ColorMode]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(COLOR_MODE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type PickerOption = string | { value: string; label: string };

/**
 * Multi-select over a long option list — 431 creature types and 557 sets are
 * far past what a plain <select> can carry, so this filters as you type and
 * keeps what you picked as removable chips.
 */
function TokenPicker({
  values,
  options,
  placeholder,
  allowFreeText = false,
  onChange,
  renderChip,
  trailing,
}: {
  values: string[];
  options: PickerOption[];
  placeholder: string;
  allowFreeText?: boolean;
  onChange: (values: string[]) => void;
  renderChip?: (value: string) => string;
  trailing?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [openList, setOpenList] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalized = useMemo(
    () =>
      options.map((option) =>
        typeof option === "string" ? { value: option, label: option } : option
      ),
    [options]
  );

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return normalized
      .filter(
        (option) =>
          !values.includes(option.value) &&
          (term === "" || option.label.toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [normalized, search, values]);

  // Close the list on an outside click without stealing focus from the modal.
  useEffect(() => {
    if (!openList) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpenList(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openList]);

  function add(value: string) {
    if (value && !values.includes(value)) onChange([...values, value]);
    setSearch("");
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-label"
            >
              {renderChip?.(value) ??
                normalized.find((option) => option.value === value)?.label ??
                value}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            value={search}
            placeholder={placeholder}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpenList(true);
            }}
            onFocus={() => setOpenList(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const exact = normalized.find(
                  (option) => option.label.toLowerCase() === search.trim().toLowerCase()
                );
                if (exact) add(exact.value);
                else if (matches.length > 0) add(matches[0].value);
                else if (allowFreeText) add(search.trim());
              } else if (e.key === "Escape" && openList) {
                // Otherwise Escape would dismiss the whole modal.
                e.stopPropagation();
                setOpenList(false);
              }
            }}
          />
          {openList && matches.length > 0 && (
            <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
              {matches.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => add(option.value)}
                    className="w-full rounded-md px-2 py-1 text-left text-ui hover:bg-accent hover:text-accent-foreground"
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {trailing}
      </div>
    </div>
  );
}
