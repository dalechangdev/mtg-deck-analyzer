"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastManager } from "@/lib/toast";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GAME_RESULT_LABEL, GAME_RESULT_STYLE } from "@/lib/mtg-styles";
import { gamesApiUrl, type GameLogEntry } from "@/lib/deck-api";
import { GameLogForm } from "./game-log-form";

interface Props {
  deckId: string;
  versionId: string;
  games: GameLogEntry[];
}

export function GameLog({ deckId, versionId, games }: Props) {
  const router = useRouter();
  // Read straight from props — router.refresh() re-renders the server page (and
  // the record in its header), so the list is never copied into state.
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(game: GameLogEntry) {
    // Two clicks rather than a browser confirm() — the notes can't be recovered.
    if (confirmDeleteId !== game.id) {
      setConfirmDeleteId(game.id);
      return;
    }
    setConfirmDeleteId(null);
    setDeletingId(game.id);
    const res = await fetch(gamesApiUrl(deckId, versionId, game.id), { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      toastManager.add({
        title: "Could not delete game",
        description: "Your change was not saved.",
        timeout: 5000,
      });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Toaster />

      {creating ? (
        <GameLogForm
          deckId={deckId}
          versionId={versionId}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <Button size="sm" onClick={() => setCreating(true)}>
          Log a game
        </Button>
      )}

      {games.length === 0 && !creating && (
        <p className="text-body text-muted-foreground">
          Nothing logged for this version yet. Notes from each game are how versions get compared.
        </p>
      )}

      <ul className="space-y-3">
        {games.map((game) =>
          editingId === game.id ? (
            <li key={game.id}>
              <GameLogForm
                deckId={deckId}
                versionId={versionId}
                game={game}
                onSaved={() => {
                  setEditingId(null);
                  router.refresh();
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={game.id} className="group rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-muted-foreground">
                <span
                  className={cn(
                    "text-label px-1.5 py-0.5 rounded-full border font-medium",
                    game.result
                      ? GAME_RESULT_STYLE[game.result]
                      : "border-border bg-muted/40 text-muted-foreground"
                  )}
                >
                  {game.result ? GAME_RESULT_LABEL[game.result] : "No result"}
                </span>
                <span className="font-mono text-foreground">{game.playedAt}</span>
                {game.podSize !== null && <span>{game.podSize}-player pod</span>}
                {game.turns !== null && (
                  <span>
                    {game.turns} turn{game.turns === 1 ? "" : "s"}
                  </span>
                )}
                {game.opponents && <span className="truncate">vs {game.opponents}</span>}

                <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <Button variant="outline" size="xs" onClick={() => setEditingId(game.id)}>
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    disabled={deletingId === game.id}
                    onClick={() => remove(game)}
                    onBlur={() => setConfirmDeleteId(null)}
                  >
                    {confirmDeleteId === game.id ? "Click again to delete" : "Delete"}
                  </Button>
                </div>
              </div>
              <p className="text-body text-foreground/90 whitespace-pre-wrap">{game.notes}</p>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
