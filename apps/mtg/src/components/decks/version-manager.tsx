"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toastManager } from "@/lib/toast";
import { Toaster } from "@/components/ui/toaster";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { NewVersionModal } from "./new-version-modal";
import { compareUrl, deckPageUrl, gamesPageUrl, versionsApiUrl, type VersionSummary } from "@/lib/deck-api";

interface Props {
  deckId: string;
  /** The version the user arrived from — highlighted in the list. */
  versionId: string;
  versions: VersionSummary[];
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

export function VersionManager({ deckId, versionId, versions }: Props) {
  const router = useRouter();
  // Read straight from props — router.refresh() re-renders the server page, and
  // copying the list into state would freeze it at its first value.
  const [branchFrom, setBranchFrom] = useState<VersionSummary | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const namesById = new Map(versions.map((v) => [v.id, v.name]));
  const onlyOne = versions.length === 1;

  /** Runs a write, toasts the server's error on failure. Returns whether it succeeded. */
  async function write(id: string, request: () => Promise<Response>, failTitle: string) {
    setBusyId(id);
    try {
      const res = await request();
      if (!res.ok) {
        toastManager.add({
          title: failTitle,
          description: await errorMessage(res, "Your change was not saved."),
          timeout: 5000,
        });
        return false;
      }
      return true;
    } finally {
      setBusyId(null);
    }
  }

  function patch(id: string, body: { name?: string; notes?: string | null }) {
    return fetch(versionsApiUrl(deckId, id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function saveName(version: VersionSummary) {
    const next = renameValue.trim();
    if (!next || next === version.name) {
      setRenamingId(null);
      return;
    }
    if (await write(version.id, () => patch(version.id, { name: next }), "Could not rename version")) {
      setRenamingId(null);
      router.refresh();
    }
  }

  async function saveNotes(version: VersionSummary, value: string) {
    const next = value.trim() || null;
    if (next === version.notes) return;
    if (await write(version.id, () => patch(version.id, { notes: next }), "Could not save notes")) {
      router.refresh();
    }
  }

  async function makeCurrent(version: VersionSummary) {
    const ok = await write(
      version.id,
      () => fetch(`${versionsApiUrl(deckId, version.id)}/current`, { method: "PUT" }),
      "Could not make this the current version"
    );
    if (ok) router.refresh();
  }

  async function remove(version: VersionSummary) {
    // Two clicks rather than a browser confirm(): deleting takes the version's
    // cards and game log with it.
    if (confirmDeleteId !== version.id) {
      setConfirmDeleteId(version.id);
      return;
    }
    setConfirmDeleteId(null);

    const ok = await write(
      version.id,
      () => fetch(versionsApiUrl(deckId, version.id), { method: "DELETE" }),
      "Could not delete version"
    );
    if (!ok) return;

    // This URL is pinned to the version just deleted; refreshing it would 404.
    if (version.id === versionId) router.replace(`/decks/${deckId}/versions`);
    else router.refresh();
  }

  return (
    <>
      <Toaster />
      {branchFrom && (
        <NewVersionModal
          deckId={deckId}
          versions={versions}
          fromVersion={branchFrom}
          onClose={() => setBranchFrom(null)}
        />
      )}

      <ul className="space-y-3">
        {versions.map((version) => {
          const busy = busyId === version.id;
          const { games, wins, losses, draws } = version.record;

          return (
            <li
              key={version.id}
              className={cn(
                "rounded-xl border bg-card p-4 space-y-3",
                version.id === versionId ? "border-primary/50" : "border-border"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {renamingId === version.id ? (
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName(version);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => saveName(version)}
                    maxLength={60}
                    autoFocus
                    className="h-8 max-w-64 text-ui font-medium"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setRenamingId(version.id);
                      setRenameValue(version.name);
                    }}
                    title="Rename"
                    className="text-ui font-medium hover:underline underline-offset-4"
                  >
                    {version.name}
                  </button>
                )}

                {version.isCurrent && (
                  <span className="text-label px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    Current
                  </span>
                )}
                {version.parentVersionId && (
                  <span className="text-label text-muted-foreground">
                    from {namesById.get(version.parentVersionId) ?? "a deleted version"}
                  </span>
                )}

                <div className="ml-auto flex items-center gap-3 text-body text-muted-foreground">
                  <span className={cn("font-mono", version.mainCount === 100 && "text-success")}>
                    {version.mainCount} / 100
                  </span>
                  <span>
                    {games === 0
                      ? "No games yet"
                      : `${wins}W · ${losses}L · ${draws}D`}
                  </span>
                  {/* UTC date slice, not toLocaleDateString: identical on server and client render. */}
                  <span>Created {version.createdAt.slice(0, 10)}</span>
                </div>
              </div>

              <Textarea
                // Re-seed from the server after a refresh; otherwise uncontrolled so typing is local.
                key={version.updatedAt}
                defaultValue={version.notes ?? ""}
                onBlur={(e) => saveNotes(version, e.target.value)}
                placeholder="What's different about this version, and why…"
                rows={2}
                className="field-sizing-fixed min-h-0 resize-none bg-background text-body md:text-body"
              />

              <div className="flex flex-wrap items-center gap-2">
                <Link href={deckPageUrl(deckId, version.id)} className={buttonVariants({ size: "xs" })}>
                  Open
                </Link>
                <Link
                  href={deckPageUrl(deckId, version.id, "/analysis")}
                  className={buttonVariants({ variant: "outline", size: "xs" })}
                >
                  Analysis
                </Link>
                <Link
                  href={gamesPageUrl(deckId, version.id)}
                  className={buttonVariants({ variant: "outline", size: "xs" })}
                >
                  Games{games > 0 ? ` (${games})` : ""}
                </Link>
                {!onlyOne && (
                  <Link
                    href={compareUrl(deckId, version.id)}
                    className={buttonVariants({ variant: "outline", size: "xs" })}
                  >
                    Compare
                  </Link>
                )}
                <Button variant="outline" size="xs" onClick={() => setBranchFrom(version)}>
                  New version from this
                </Button>
                {!version.isCurrent && (
                  <Button variant="outline" size="xs" disabled={busy} onClick={() => makeCurrent(version)}>
                    Make current
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="xs"
                  className="ml-auto"
                  disabled={busy || onlyOne}
                  title={onlyOne ? "A deck needs at least one version" : undefined}
                  onClick={() => remove(version)}
                  onBlur={() => setConfirmDeleteId(null)}
                >
                  {confirmDeleteId === version.id ? "Click again to delete" : "Delete"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
