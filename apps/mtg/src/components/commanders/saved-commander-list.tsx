"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@/components/ui/shell";
import { MANA_PIP } from "@/lib/mtg-styles";
import { toastManager } from "@/lib/toast";
import type { SavedCommanderView } from "@/lib/saved-commanders";
import { NOTE_MAX_LENGTH } from "@/lib/saved-commander-input";

export function SavedCommanderList({ initialEntries }: { initialEntries: SavedCommanderView[] }) {
  const [entries, setEntries] = useState(initialEntries);

  const remove = async (id: string) => {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    const res = await fetch(`/api/commanders/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setEntries(previous);
      toastManager.add({ title: "Couldn't remove that commander", timeout: 4000 });
    }
  };

  return (
    <PageShell>
      <h1 className="text-title font-semibold">Saved Commanders</h1>

      <p className="text-ui text-muted-foreground">
        {entries.length === 0 ? (
          <>
            Nothing saved yet. Open a commander in the{" "}
            <Link href="/cards?commander=1" className="text-primary underline-offset-4 hover:underline">
              Cards browser
            </Link>{" "}
            and choose “Save commander”.
          </>
        ) : (
          `${entries.length} commander${entries.length !== 1 ? "s" : ""} to build around`
        )}
      </p>

      {entries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {entries.map((entry) => (
            <SavedCommanderCard key={entry.id} entry={entry} onRemove={() => remove(entry.id)} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function SavedCommanderCard({ entry, onRemove }: { entry: SavedCommanderView; onRemove: () => void }) {
  const { card } = entry;
  const [note, setNote] = useState(entry.note ?? "");
  const [savedNote, setSavedNote] = useState(entry.note ?? "");
  const [saving, setSaving] = useState(false);

  const saveNote = async () => {
    if (note.trim() === savedNote.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/commanders/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("request failed");
      const { note: stored } = await res.json();
      setSavedNote(stored ?? "");
      setNote(stored ?? "");
    } catch {
      toastManager.add({ title: "Couldn't save the note", description: "Your change was not saved.", timeout: 4000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
      {entry.artUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.artUrl} alt={card.name} className="w-full aspect-[4/3] object-cover" loading="lazy" />
      ) : (
        <div className="w-full aspect-[4/3] bg-muted" />
      )}

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-ui truncate">{card.name}</div>
            <div className="text-body text-muted-foreground truncate">{card.typeLine}</div>
          </div>
          <div className="flex gap-1 pt-1" aria-label={`Colour identity: ${card.colorIdentity.join("") || "colourless"}`}>
            {card.colorIdentity.map((c) => (
              <span key={c} className={`w-3 h-3 rounded-full border ${MANA_PIP[c] ?? "bg-muted-foreground"}`} />
            ))}
          </div>
        </div>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          maxLength={NOTE_MAX_LENGTH}
          rows={2}
          placeholder="Ideas for this deck…"
          aria-label={`Note for ${card.name}`}
        />

        {entry.decks.length > 0 && (
          <div className="text-body text-muted-foreground">
            Built as{" "}
            {entry.decks.map((deck, i) => (
              <span key={deck.id}>
                {i > 0 && ", "}
                <Link href={`/decks/${deck.id}`} className="text-primary underline-offset-4 hover:underline">
                  {deck.name}
                </Link>
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2">
          <Button
            size="sm"
            render={<Link href={`/decks/start?commander=${encodeURIComponent(card.cardId)}`} />}
            nativeButton={false}
          >
            Build
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}
