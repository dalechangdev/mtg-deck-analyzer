"use client";

import { useEffect, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

type Annotation = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

interface Props {
  deckId: string;
  cardId: string;
  cardName: string;
  imageUrl: string | null;
  onClose: () => void;
}

export function CardAnnotationModal({ deckId, cardId, cardName, imageUrl, onClose }: Props) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");


  useEffect(() => {
    fetch(`/api/decks/${deckId}/annotations?cardId=${encodeURIComponent(cardId)}`)
      .then((r) => r.json())
      .then((data) => setAnnotations(data))
      .finally(() => setLoading(false));
  }, [deckId, cardId]);

  async function addAnnotation() {
    if (!newContent.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, content: newContent }),
      });
      if (res.ok) {
        const annotation = await res.json();
        setAnnotations((prev) => [...prev, annotation]);
        setNewContent("");
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editContent.trim()) return;
    const res = await fetch(`/api/decks/${deckId}/annotations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent }),
    });
    if (res.ok) {
      const updated = await res.json();
      setAnnotations((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setEditingId(null);
    }
  }

  async function deleteAnnotation(id: string) {
    const res = await fetch(`/api/decks/${deckId}/annotations/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" className="max-h-[80vh]">
      <ModalHeader title="Notes" description={cardName} className="px-4" />

      {/* Card image */}
      {imageUrl && (
        <div className="flex justify-center px-4 py-3 border-b border-border flex-shrink-0 bg-muted/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={cardName}
            className="rounded-xl w-40 aspect-[63/88] object-cover shadow-md"
          />
        </div>
      )}

      {/* Annotation list */}
      <ModalBody className="p-4 space-y-3">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : annotations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No notes yet. Add one below.</p>
          ) : (
            annotations.map((a) => (
              <div key={a.id} className="group rounded-lg border border-border bg-muted/20 p-3">
                {editingId === a.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null);
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          saveEdit(a.id);
                        }
                      }}
                      rows={3}
                      autoFocus
                      className="field-sizing-fixed min-h-0 resize-none bg-background text-body md:text-body"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(a.id)}
                        className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 items-start">
                    <p className="flex-1 text-xs text-foreground/90 whitespace-pre-wrap">{a.content}</p>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => { setEditingId(a.id); setEditContent(a.content); }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteAnnotation(a.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-red-800/50 text-red-400/70 hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
      </ModalBody>

      {/* New annotation input */}
      <div className="px-4 py-3 border-t border-border flex-shrink-0 space-y-2">
        <Textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              addAnnotation();
            }
          }}
          placeholder="Add a note… (⌘Enter to save)"
          rows={3}
          className="field-sizing-fixed min-h-0 resize-none bg-background text-body md:text-body"
        />
        <button
          onClick={addAnnotation}
          disabled={saving || !newContent.trim()}
          className="w-full text-xs py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Add Note"}
        </button>
      </div>
    </Modal>
  );
}
