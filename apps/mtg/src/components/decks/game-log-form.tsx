"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GAME_RESULT_LABEL, GAME_RESULT_STYLE } from "@/lib/mtg-styles";
import { gamesApiUrl, type GameLogEntry, type GameResult } from "@/lib/deck-api";

const RESULTS: GameResult[] = ["WIN", "LOSS", "DRAW"];

interface Props {
  deckId: string;
  versionId: string;
  /** The game being edited; omit to log a new one. */
  game?: GameLogEntry;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * The player's local date. Only ever called from a click-opened form, so it runs
 * in the browser — during a server render it would use the server's timezone
 * and could disagree with the client by a day.
 */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Number inputs hand back strings; "" means not recorded. */
function toOptionalInt(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function GameLogForm({ deckId, versionId, game, onSaved, onCancel }: Props) {
  const [playedAt, setPlayedAt] = useState(() => game?.playedAt ?? localToday());
  const [result, setResult] = useState<GameResult | null>(game?.result ?? null);
  const [podSize, setPodSize] = useState(game?.podSize?.toString() ?? "");
  const [turns, setTurns] = useState(game?.turns?.toString() ?? "");
  const [opponents, setOpponents] = useState(game?.opponents ?? "");
  const [notes, setNotes] = useState(game?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idPrefix = game ? `game-${game.id}` : "new-game";

  async function save() {
    if (!notes.trim() || saving) return;
    setSaving(true);
    setError(null);

    const res = await fetch(gamesApiUrl(deckId, versionId, game?.id), {
      method: game ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playedAt,
        result,
        podSize: toOptionalInt(podSize),
        turns: toOptionalInt(turns),
        opponents: opponents.trim() || null,
        notes,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not save the game.");
      return;
    }
    onSaved();
  }

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 space-y-4"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-date`}>Date</Label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
            className="h-8 w-40"
          />
        </div>

        <div className="space-y-1.5">
          <span className="block text-ui font-medium leading-none">Result</span>
          <div role="group" aria-label="Result" className="flex items-center gap-1">
            {RESULTS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={result === r}
                onClick={() => setResult(result === r ? null : r)}
                className={cn(
                  "h-8 px-3 rounded-md border text-body font-medium transition-colors",
                  result === r
                    ? GAME_RESULT_STYLE[r]
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {GAME_RESULT_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-pod`}>Pod size</Label>
          <Input
            id={`${idPrefix}-pod`}
            type="number"
            min={2}
            max={10}
            value={podSize}
            onChange={(e) => setPodSize(e.target.value)}
            className="h-8 w-20"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-turns`}>Turns</Label>
          <Input
            id={`${idPrefix}-turns`}
            type="number"
            min={1}
            max={99}
            value={turns}
            onChange={(e) => setTurns(e.target.value)}
            className="h-8 w-20"
          />
        </div>

        <div className="space-y-1.5 flex-1 min-w-48">
          <Label htmlFor={`${idPrefix}-opponents`}>Opponents</Label>
          <Input
            id={`${idPrefix}-opponents`}
            value={opponents}
            onChange={(e) => setOpponents(e.target.value)}
            placeholder="Atraxa, Krenko, Yuriko"
            maxLength={500}
            className="h-8"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What worked, what didn't, which cards over- or under-performed… (⌘Enter to save)"
          rows={4}
          autoFocus
          className="field-sizing-fixed min-h-0 resize-y bg-background text-body md:text-body"
        />
      </div>

      {error && <p className="text-body text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !notes.trim()}>
          {saving ? "Saving…" : game ? "Save changes" : "Log game"}
        </Button>
      </div>
    </div>
  );
}
