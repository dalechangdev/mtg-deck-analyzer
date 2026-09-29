"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardData } from "@/lib/commander";
import { CommanderPicker } from "@/components/decks/commander-picker";

export type TemplateOption = {
  id: string;
  name: string;
  description: string | null;
  deckSize: number;
  isBuiltIn: boolean;
  requirements: { roleName: string; targetCount: number }[];
};

/**
 * Commander, then template, then a name that defaults to the commander's.
 * Creating the deck attaches the template, so /build knows what to suggest.
 */
export function StartDeckForm({
  templates,
  defaultTemplateId,
}: {
  templates: TemplateOption[];
  defaultTemplateId: string;
}) {
  const router = useRouter();
  const [commander, setCommander] = useState<CardData | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(
    templates.find((t) => t.id === defaultTemplateId)?.id ?? templates[0]?.id ?? null
  );
  // Null until the user types one, so it tracks whichever commander is picked.
  const [name, setName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deckName = name ?? commander?.name ?? "";
  const ready = commander !== null && templateId !== null && deckName.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: deckName.trim(), commanderId: commander.cardId, templateId }),
    });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/decks/${id}/build`);
    } else {
      setError((await res.json().catch(() => null))?.error ?? "Could not create the deck");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-1.5">
        <label className="text-ui font-medium">1. Commander</label>
        <CommanderPicker value={commander} onChange={setCommander} autoFocus />
      </section>

      <section className="space-y-1.5">
        <div className="text-ui font-medium">2. Template</div>
        {templates.length === 0 ? (
          <p className="text-body text-muted-foreground">No templates yet — create one on the Templates page.</p>
        ) : (
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
            {templates.map((t) => {
              const selected = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTemplateId(t.id)}
                  className={cn(
                    "text-left rounded-lg border p-3 space-y-1.5 transition-colors",
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-ui font-medium truncate">{t.name}</span>
                    <span className="text-micro text-muted-foreground flex-shrink-0">
                      {t.isBuiltIn ? "Built-in" : "Yours"} · {t.deckSize} cards
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-body text-muted-foreground line-clamp-2">{t.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {t.requirements.map((r) => (
                      <span
                        key={r.roleName}
                        className="text-micro rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                      >
                        {r.targetCount} {r.roleName}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <label className="text-ui font-medium" htmlFor="deck-name">3. Deck name</label>
        <Input
          id="deck-name"
          value={deckName}
          onChange={(e) => setName(e.target.value)}
          placeholder="Named after the commander by default"
        />
      </section>

      {error && <p className="text-body text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={!ready || submitting}
        className={cn(buttonVariants(), "w-full disabled:opacity-50")}
      >
        {submitting ? "Creating…" : "Start building"}
      </button>
    </form>
  );
}
