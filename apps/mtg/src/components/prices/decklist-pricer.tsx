"use client";

import { useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_ATTEMPTS_PER_CARD } from "@/lib/printing-choice";
import type { CardPrice, PricedLine, PriceEvent, PrintingAttempt } from "@/lib/price-events";

const BOARD_LABEL = { commanders: "Commander", mainboard: null } as const;

function formatCents(cents: number, currency: string | null) {
  return new Intl.NumberFormat("en", { style: "currency", currency: currency ?? "EUR" }).format(
    cents / 100
  );
}

function formatAge(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function describeAttempt(a: PrintingAttempt) {
  if (a.status === "error") return `${a.setName}: lookup failed`;
  if (a.status === "not_found") return `${a.setName}: not on Ítaca`;
  if (!a.inStock || a.lowestPriceCents == null) return `${a.setName}: sold out`;
  return `${a.setName}: ${formatCents(a.lowestPriceCents, a.currency)}`;
}

/** Sort buckets: in stock first (by line total), then sold out, not found, failed, pending, unknown. */
const RANK: Record<CardPrice["status"], number> = { in_stock: 0, sold_out: 1, not_found: 2, error: 3 };
function rank(line: PricedLine, result: CardPrice | undefined) {
  if (!line.key) return 5;
  return result ? RANK[result.status] : 4;
}

export function DecklistPricer() {
  const [text, setText] = useState("");
  const [skipBasics, setSkipBasics] = useState(true);
  const [lines, setLines] = useState<PricedLine[]>([]);
  const [results, setResults] = useState<Map<string, CardPrice>>(new Map());
  const [meta, setMeta] = useState<{ cards: number; skippedBasics: number; unparsed: string[] } | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // For the ETA: time spent on cards that needed Ítaca requests, and how many.
  // A ref, because `handle` runs inside the closure `run` started with.
  const pacing = useRef({ last: 0, fetchedMs: 0, fetchedCards: 0, total: 0, done: 0 });

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || running) return;

    const controller = new AbortController();
    abortRef.current = controller;
    pacing.current = { last: Date.now(), fetchedMs: 0, fetchedCards: 0, total: 0, done: 0 };
    setRunning(true);
    setError(null);
    setLines([]);
    setResults(new Map());
    setMeta(null);
    setEtaMinutes(null);

    try {
      const res = await fetch("/api/prices/decklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, skipBasics }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Pricing failed");
        return;
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const chunks = buffer.split("\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (chunk) handle(JSON.parse(chunk) as PriceEvent);
        }
      }
    } catch {
      if (!controller.signal.aborted) setError("Lost the connection while pricing");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handle(event: PriceEvent) {
    if (event.type === "deck") {
      pacing.current.total = event.cards;
      setLines(event.lines);
      setMeta({ cards: event.cards, skippedBasics: event.skippedBasics, unparsed: event.unparsed });
    } else if (event.type === "price") {
      const now = Date.now();
      const p = pacing.current;
      if (event.result.attempts.some((a) => !a.cached)) {
        p.fetchedMs += now - p.last;
        p.fetchedCards += 1;
      }
      p.last = now;
      p.done += 1;
      const left = p.total - p.done;
      if (p.fetchedCards >= 2 && left > 0) {
        setEtaMinutes(Math.ceil((left * p.fetchedMs) / p.fetchedCards / 60_000));
      }
      setResults((prev) => new Map(prev).set(event.result.key, event.result));
    }
  }

  const rows = useMemo(
    () =>
      lines
        .map((line) => {
          const result = line.key ? results.get(line.key) : undefined;
          const each = result?.status === "in_stock" ? result.best!.lowestPriceCents! : null;
          const total = each != null ? each * line.quantity : null;
          return { line, result, each, total, rank: rank(line, result) };
        })
        .sort((a, b) => a.rank - b.rank || (b.total ?? 0) - (a.total ?? 0) || a.line.name.localeCompare(b.line.name)),
    [lines, results]
  );

  const summary = useMemo(() => {
    let cents = 0;
    let priced = 0;
    let currency: string | null = null;
    for (const r of rows) {
      if (r.total == null) continue;
      cents += r.total;
      priced += r.line.quantity;
      currency ??= r.result?.best?.currency ?? null;
    }
    const cards = rows.reduce((n, r) => n + r.line.quantity, 0);
    return { cents, priced, cards, currency };
  }, [rows]);

  const remaining = meta ? meta.cards - results.size : 0;

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"1 Sol Ring (CMM) 410\n1 Arcane Signet (M3C) 283\n…"}
          className="min-h-48 max-h-96 font-mono"
          aria-label="Decklist"
          disabled={running}
        />
        <p className="text-body text-muted-foreground">
          In Moxfield: More → Export → Copy as plain text. Sideboard and maybeboard are ignored.
          Each card is checked in up to {MAX_ATTEMPTS_PER_CARD} printings for the cheapest copy in stock.
        </p>
        <div className="flex items-center gap-4">
          {running ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!text.trim()} className={cn(buttonVariants(), "disabled:opacity-50")}>
              Price on Ítaca
            </button>
          )}
          <label className="flex items-center gap-2 text-ui">
            <input
              type="checkbox"
              checked={skipBasics}
              onChange={(e) => setSkipBasics(e.target.checked)}
              disabled={running}
            />
            Skip basic lands
          </label>
        </div>
        {error && <p className="text-ui text-destructive">{error}</p>}
      </form>

      {meta && (
        <div className="space-y-1">
          <p className="text-lead font-semibold">
            {formatCents(summary.cents, summary.currency)}
            <span className="ml-2 text-ui font-normal text-muted-foreground">
              for {summary.priced} of {summary.cards} cards
            </span>
          </p>
          <p className="text-body text-muted-foreground">
            {running && remaining > 0
              ? `Checked ${results.size} of ${meta.cards} cards${etaMinutes ? ` — about ${etaMinutes} min left` : ""}. Stopping keeps what's been checked; a re-run resumes from the cache.`
              : remaining > 0
                ? `Stopped with ${remaining} of ${meta.cards} cards not checked.`
                : "All cards checked."}
            {meta.skippedBasics > 0 && ` ${meta.skippedBasics} basic land lines skipped.`}
          </p>
          {meta.unparsed.length > 0 && (
            <p className="text-body text-destructive">Couldn&apos;t read: {meta.unparsed.join(", ")}</p>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <table className="w-full text-ui">
          <thead className="text-label uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-2 font-medium">Qty</th>
              <th className="py-2 pr-2 font-medium">Card</th>
              <th className="py-2 pr-2 font-medium">Printing</th>
              <th className="py-2 pr-2 font-medium text-right">Each</th>
              <th className="py-2 pr-2 font-medium text-right">Total</th>
              <th className="py-2 font-medium">Ítaca</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, result, each, total }, i) => (
              <tr key={`${line.board}|${line.name}|${line.namedSetCode}|${i}`} className="border-b border-border/50">
                <td className="py-1.5 pr-2 tabular-nums align-top">{line.quantity}</td>
                <td className="py-1.5 pr-2 align-top">
                  {line.name}
                  {BOARD_LABEL[line.board] && (
                    <Badge variant="secondary" className="ml-2">{BOARD_LABEL[line.board]}</Badge>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-muted-foreground align-top">
                  <PrintingCell line={line} result={result} />
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums align-top">
                  {each != null ? formatCents(each, result?.best?.currency ?? null) : ""}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums align-top">
                  {total != null ? formatCents(total, result?.best?.currency ?? null) : ""}
                </td>
                <td className="py-1.5 text-muted-foreground align-top">
                  <StatusCell line={line} result={result} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Where the price came from, and what happened to the printing the list asked for if that differs. */
function PrintingCell({ line, result }: { line: PricedLine; result: CardPrice | undefined }) {
  if (!result?.best) return <>—</>;
  const named = line.namedSetCode
    ? result.attempts.find((a) => a.setCode === line.namedSetCode)
    : undefined;
  const switched = line.namedSetCode && result.best.setCode !== line.namedSetCode;
  return (
    <>
      {result.best.setName}
      {switched && (
        <span className="block text-body">
          {named
            ? `listed: ${describeAttempt(named)}`
            : `listed: ${line.namedSetCode!.toUpperCase()} (not on Ítaca)`}
        </span>
      )}
    </>
  );
}

function StatusCell({ line, result }: { line: PricedLine; result: CardPrice | undefined }) {
  if (!line.key) return <span className="text-destructive">Unknown card</span>;
  if (!result) return <span>…</span>;

  const checked = result.attempts.length;
  const detail = result.attempts.map(describeAttempt).join("\n");
  const summary = (
    <span className="block text-body" title={detail}>
      {checked === 0 ? "no printing on Ítaca" : `${checked} printing${checked === 1 ? "" : "s"} checked`}
    </span>
  );

  if (result.status === "error") {
    return <span className="text-destructive">Lookup failed{summary}</span>;
  }
  if (result.status === "not_found") return <span>Not found{summary}</span>;

  const label = result.status === "in_stock" ? "In stock" : "Sold out everywhere checked";
  const best = result.best!;
  return (
    <span title={`Checked ${formatAge(best.fetchedAt)}`}>
      {best.url ? (
        <a href={best.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
          {label} ↗
        </a>
      ) : (
        label
      )}
      {summary}
    </span>
  );
}
