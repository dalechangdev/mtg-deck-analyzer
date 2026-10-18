"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastManager } from "@/lib/toast";

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "unsaved" }
  | { kind: "saved"; id: string };

/**
 * Save/unsave toggle for a commander-eligible card (docs/plans/saved-commanders.md).
 * Card browsing works signed out, so then it falls back to the plain badge.
 */
export function SaveCommanderButton({ cardId }: { cardId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/commanders?cardId=${encodeURIComponent(cardId)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) return setState({ kind: "signed-out" });
        if (!res.ok) throw new Error("request failed");
        const [entry] = (await res.json()) as { id: string }[];
        if (!cancelled) setState(entry ? { kind: "saved", id: entry.id } : { kind: "unsaved" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "unsaved" });
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const toggle = async () => {
    if (busy || (state.kind !== "saved" && state.kind !== "unsaved")) return;
    setBusy(true);
    try {
      if (state.kind === "saved") {
        const res = await fetch(`/api/commanders/${state.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("request failed");
        setState({ kind: "unsaved" });
      } else {
        const res = await fetch("/api/commanders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId }),
        });
        if (!res.ok) throw new Error("request failed");
        const { id } = await res.json();
        setState({ kind: "saved", id });
      }
    } catch {
      toastManager.add({ title: "Couldn't update saved commanders", timeout: 4000 });
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === "signed-out") {
    return <span className="font-medium text-warning">⭐ Can be your Commander</span>;
  }

  const saved = state.kind === "saved";
  return (
    <Button
      onClick={toggle}
      disabled={busy || state.kind === "loading"}
      variant="outline"
      size="sm"
      aria-pressed={saved}
      title={saved ? "Remove from saved commanders" : "Save to build around later"}
    >
      {saved ? "★ Saved commander" : "☆ Save commander"}
    </Button>
  );
}
