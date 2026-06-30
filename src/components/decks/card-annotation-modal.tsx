"use client";

import { useEffect, useState } from "react";

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Notes</h2>
            <p className="text-xs text-muted-foreground">{cardName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

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
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : annotations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No notes yet. Add one below.</p>
          ) : (
            annotations.map((a) => (
              <div key={a.id} className="group rounded-lg border border-border bg-muted/20 p-3">
                {editingId === a.id ? (
                  <div className="space-y-2">
                    <textarea
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
                      className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
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
        </div>

        {/* New annotation input */}
        <div className="px-4 py-3 border-t border-border flex-shrink-0 space-y-2">
          <textarea
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
            className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={addAnnotation}
            disabled={saving || !newContent.trim()}
            className="w-full text-xs py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Add Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
