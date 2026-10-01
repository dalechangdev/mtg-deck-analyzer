"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { formatCents, PriceTable, type Checking } from "@/components/prices/price-table";
import { cn } from "@/lib/utils";
import { MAX_ATTEMPTS_PER_CARD } from "@/lib/printing-choice";
import { summarize } from "@/lib/price-summary";
import type { CardPrice, PricedLine, PriceEvent } from "@/lib/price-events";

export function DecklistPricer({
  initialText = "",
  initialSkipBasics = true,
}: {
  /** Prefilled from a saved search ("Price again"). */
  initialText?: string;
  initialSkipBasics?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [skipBasics, setSkipBasics] = useState(initialSkipBasics);
  const [lines, setLines] = useState<PricedLine[]>([]);
  const [results, setResults] = useState<Map<string, CardPrice>>(new Map());
  const [meta, setMeta] = useState<{ cards: number; skippedBasics: number; unparsed: string[] } | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [checking, setChecking] = useState<Checking | null>(null);
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
    setSavedId(null);
    setChecking(null);

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
      setChecking(null);
      abortRef.current = null;
    }
  }

  function handle(event: PriceEvent) {
    if (event.type === "deck") {
      pacing.current.total = event.cards;
      setLines(event.lines);
      setMeta({ cards: event.cards, skippedBasics: event.skippedBasics, unparsed: event.unparsed });
    } else if (event.type === "checking") {
      setChecking({ key: event.key, attempt: event.attempt, of: event.of });
    } else if (event.type === "price") {
      setChecking((c) => (c?.key === event.result.key ? null : c));
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
    } else if (event.type === "done") {
      setSavedId(event.searchId);
    }
  }

  const summary = useMemo(() => summarize(lines, results), [lines, results]);
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
            {formatCents(summary.totalCents, summary.currency)}
            <span className="ml-2 text-ui font-normal text-muted-foreground">
              for {summary.pricedCards} of {summary.totalCards} cards
            </span>
          </p>
          <p className="text-body text-muted-foreground">
            {running && remaining > 0
              ? `Checked ${results.size} of ${meta.cards} cards${etaMinutes ? ` — about ${etaMinutes} min left` : ""}. Stopping keeps what's been checked; a re-run resumes from the cache.`
              : remaining > 0
                ? `Stopped with ${remaining} of ${meta.cards} cards not checked.`
                : "All cards checked."}
            {meta.skippedBasics > 0 && ` ${meta.skippedBasics} basic land lines skipped.`}
            {savedId && (
              <>
                {" "}
                <Link href={`/prices/${savedId}`} className="underline underline-offset-2 hover:text-foreground">
                  Saved to history
                </Link>
                .
              </>
            )}
          </p>
          {meta.unparsed.length > 0 && (
            <p className="text-body text-destructive">Couldn&apos;t read: {meta.unparsed.join(", ")}</p>
          )}
        </div>
      )}

      <PriceTable lines={lines} results={results} checking={checking} />
    </div>
  );
}
