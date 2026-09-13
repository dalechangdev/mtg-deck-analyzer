"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { deckPageUrl, versionsApiUrl, type VersionSummary } from "@/lib/deck-api";

type VersionRef = Pick<VersionSummary, "id" | "name">;

interface Props {
  deckId: string;
  /** All versions of the deck — only their names are used, to suggest a free one. */
  versions: VersionRef[];
  /** The version whose cards the new one starts from. */
  fromVersion: VersionRef;
  onClose: () => void;
}

/** First free "vN" — a suggestion the user is free to overwrite. */
function suggestName(names: string[]): string {
  const taken = new Set(names);
  let n = names.length + 1;
  while (taken.has(`v${n}`)) n++;
  return `v${n}`;
}

/**
 * Create a version as a copy of an existing one, then open it in the builder.
 * The copy is made server-side, so the new version starts from the saved card
 * list — not from anything still in flight in the builder.
 */
export function NewVersionModal({ deckId, versions, fromVersion, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState(() => suggestName(versions.map((v) => v.name)));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);

    const res = await fetch(versionsApiUrl(deckId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, notes: notes.trim() || null, fromVersionId: fromVersion.id }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not create the version.");
      setSaving(false);
      return;
    }

    const { id } = await res.json();
    router.push(deckPageUrl(deckId, id));
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <ModalHeader title="New version" description={`Starts as a copy of ${fromVersion.name}`} />

      <ModalBody className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-version-name">Name</Label>
          <Input
            id="new-version-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
            maxLength={60}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-version-notes">Notes</Label>
          <Textarea
            id="new-version-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What are you trying in this version?"
            rows={3}
            className="field-sizing-fixed min-h-0 resize-none bg-background text-body md:text-body"
          />
        </div>

        {error && <p className="text-body text-danger">{error}</p>}
      </ModalBody>

      <div className="flex justify-end gap-2 px-5 py-3 border-t border-border flex-shrink-0">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={create} disabled={saving || !name.trim()}>
          {saving ? "Creating…" : "Create version"}
        </Button>
      </div>
    </Modal>
  );
}
