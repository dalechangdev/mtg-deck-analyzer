"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toastManager } from "@/lib/toast";
import { FullHeightView } from "@/components/ui/shell";
import { SectionLabel } from "@/components/ui/section-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Requirement = {
  roleId: string;
  targetCount: number;
  minCount: number | null;
  maxCount: number | null;
  note: string | null;
};

export type TemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  format: string;
  deckSize: number;
  isBuiltIn: boolean;
  requirements: Requirement[];
};

type Role = { id: string; name: string; description: string | null };

// A template being edited. `id` is null for one that hasn't been saved yet.
type Draft = {
  id: string | null;
  name: string;
  description: string;
  deckSize: number;
  requirements: Requirement[];
};

function toDraft(template: TemplateSummary): Draft {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    deckSize: template.deckSize,
    // Field by field: the detail endpoint also returns roleName/roleDescription,
    // which have no business in a save body.
    requirements: template.requirements.map((r) => ({
      roleId: r.roleId,
      targetCount: r.targetCount,
      minCount: r.minCount,
      maxCount: r.maxCount,
      note: r.note,
    })),
  };
}

interface Props {
  initialTemplates: TemplateSummary[];
  roles: Role[];
}

export function TemplateManager({ initialTemplates, roles }: Props) {
  const router = useRouter();

  // Read straight from props — router.refresh() re-renders the server component,
  // and copying into state here would freeze the list at its first value.
  const templates = initialTemplates;
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTemplates[0]?.id ?? null
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  // The draft shadows the selected template while editing.
  const targetSum = useMemo(() => {
    const source = draft?.requirements ?? selected?.requirements ?? [];
    return source.reduce((sum, r) => sum + (r.targetCount || 0), 0);
  }, [draft, selected]);

  const deckSize = draft?.deckSize ?? selected?.deckSize ?? 100;

  const startNew = useCallback(() => {
    setDraft({
      id: null,
      name: "",
      description: "",
      deckSize: 100,
      requirements: [{ roleId: roles[0]?.id ?? "", targetCount: 10, minCount: null, maxCount: null, note: null }],
    });
  }, [roles]);

  const startEdit = useCallback((template: TemplateSummary) => {
    setDraft(toDraft(template));
  }, []);

  /**
   * Duplicating is a server operation — it copies the format and picks a free
   * "(copy N)" name, neither of which this component can do on its own. The
   * copy is then read back and opened for editing, since wanting to change
   * something is the reason to duplicate a template at all.
   */
  const duplicate = useCallback(
    async (template: TemplateSummary) => {
      setSaving(true);
      const res = await fetch(`/api/templates/${template.id}/duplicate`, { method: "POST" });
      setSaving(false);

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Duplicate failed" }));
        toastManager.add({
          title: "Could not duplicate template",
          description: error.error,
          timeout: 5000,
        });
        return;
      }

      const { id } = await res.json();
      setSelectedId(id);

      // Read the copy back rather than assuming what the server copied.
      const copy = await fetch(`/api/templates/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (copy) setDraft(toDraft(copy));

      router.refresh();
    },
    [router]
  );

  const updateRequirement = useCallback(
    (index: number, patch: Partial<Requirement>) => {
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              requirements: prev.requirements.map((r, i) =>
                i === index ? { ...r, ...patch } : r
              ),
            }
          : prev
      );
    },
    []
  );

  const save = useCallback(async () => {
    if (!draft) return;

    if (!draft.name.trim()) {
      toastManager.add({ title: "Name is required", timeout: 3000 });
      return;
    }
    // The unique index is on (templateId, roleId) — a duplicate role would be
    // rejected by Postgres with an opaque error, so catch it here.
    const roleIds = draft.requirements.map((r) => r.roleId);
    if (new Set(roleIds).size !== roleIds.length) {
      toastManager.add({ title: "Each role can appear only once", timeout: 3000 });
      return;
    }

    setSaving(true);
    const body = JSON.stringify({
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      deckSize: draft.deckSize,
      requirements: draft.requirements,
    });

    const res = draft.id
      ? await fetch(`/api/templates/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body,
        })
      : await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
    setSaving(false);

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Save failed" }));
      toastManager.add({ title: "Could not save template", description: error.error, timeout: 5000 });
      return;
    }

    // Land on the template that was just saved, new or edited.
    const saved = draft.id ?? (await res.json().catch(() => null))?.id ?? null;
    if (saved) setSelectedId(saved);

    setDraft(null);
    router.refresh();
  }, [draft, router]);

  const remove = useCallback(
    async (template: TemplateSummary) => {
      const res = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Delete failed" }));
        toastManager.add({ title: "Could not delete", description: error.error, timeout: 5000 });
        return;
      }
      setSelectedId(null);
      setDraft(null);
      router.refresh();
    },
    [router]
  );

  return (
    <FullHeightView className="flex-row">
      {/* Template list */}
      <div className="w-64 border-r border-border flex flex-col flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <SectionLabel size="body">Templates</SectionLabel>
          <button
            onClick={startNew}
            className="ml-auto text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground"
          >
            + New
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => {
                  setSelectedId(t.id);
                  setDraft(null);
                }}
                className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-muted/40 ${
                  selectedId === t.id && !draft ? "bg-muted/50" : ""
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs truncate">{t.name}</span>
                  {t.isBuiltIn && (
                    <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground flex-shrink-0">
                      built-in
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {t.requirements.length} roles · {t.deckSize} cards
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Editor / detail */}
      <div className="flex-1 overflow-y-auto">
        {!selected && !draft ? (
          <p className="p-6 text-sm text-muted-foreground">
            Select a template, or create one.
          </p>
        ) : draft ? (
          <div className="p-4 max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Template name"
                className="text-sm font-medium bg-transparent border-b border-border focus:border-input outline-none py-1 flex-1"
              />
              <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                Deck size
                <input
                  type="number"
                  value={draft.deckSize}
                  onChange={(e) =>
                    setDraft({ ...draft, deckSize: Number(e.target.value) || 0 })
                  }
                  className="w-16 bg-transparent border border-border rounded px-1.5 py-0.5 font-mono text-foreground"
                />
              </label>
            </div>

            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Description (optional)"
              className="w-full text-xs bg-transparent border-b border-border focus:border-input outline-none py-1 mb-4 text-muted-foreground"
            />

            <div className="flex items-center gap-2 mb-2">
              <SectionLabel>Requirements</SectionLabel>
              <span className="text-[11px] text-muted-foreground">
                targets sum to <span className="font-mono">{targetSum}</span>
                {targetSum > deckSize && (
                  <span className="text-amber-400/90">
                    {" "}
                    — {targetSum - deckSize} cards must fill more than one role
                  </span>
                )}
              </span>
            </div>

            <ul className="space-y-1.5">
              {draft.requirements.map((req, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Select
                    value={req.roleId}
                    onValueChange={(value) =>
                      updateRequirement(i, { roleId: value as string })
                    }
                  >
                    <SelectTrigger size="sm" className="flex-1 text-body">
                      <SelectValue>
                        {(value) => rolesById.get(value as string)?.name ?? value}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    target
                    <input
                      type="number"
                      value={req.targetCount}
                      onChange={(e) =>
                        updateRequirement(i, { targetCount: Number(e.target.value) || 0 })
                      }
                      className="w-14 bg-transparent border border-border rounded px-1.5 py-1 font-mono text-foreground"
                    />
                  </label>

                  <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    min
                    <input
                      type="number"
                      value={req.minCount ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        updateRequirement(i, {
                          minCount: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-14 bg-transparent border border-border rounded px-1.5 py-1 font-mono text-foreground"
                    />
                  </label>

                  <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    max
                    <input
                      type="number"
                      value={req.maxCount ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        updateRequirement(i, {
                          maxCount: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-14 bg-transparent border border-border rounded px-1.5 py-1 font-mono text-foreground"
                    />
                  </label>

                  <button
                    onClick={() =>
                      setDraft({
                        ...draft,
                        requirements: draft.requirements.filter((_, j) => j !== i),
                      })
                    }
                    className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-950/30 text-xs"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  requirements: [
                    ...draft.requirements,
                    {
                      roleId:
                        roles.find((r) => !draft.requirements.some((q) => q.roleId === r.id))
                          ?.id ?? roles[0]?.id ?? "",
                      targetCount: 1,
                      minCount: null,
                      maxCount: null,
                      note: null,
                    },
                  ],
                })
              }
              className="mt-2 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
            >
              + Add requirement
            </button>

            <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
              A blank <span className="font-mono">min</span> makes the target a floor; a blank{" "}
              <span className="font-mono">max</span> leaves the role uncapped. Roles overlap —
              one card can satisfy several requirements, so targets are expected to sum past
              the deck size.
            </p>

            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border">
              <button
                onClick={save}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : draft.id ? "Save changes" : "Create template"}
              </button>
              <button
                onClick={() => setDraft(null)}
                className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : selected ? (
          <div className="p-4 max-w-3xl">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-sm font-medium">{selected.name}</h1>
              {selected.isBuiltIn && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  built-in · read-only
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => duplicate(selected)}
                  disabled={saving}
                  className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Duplicate
                </button>
                {!selected.isBuiltIn && (
                  <>
                    <button
                      onClick={() => startEdit(selected)}
                      className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(selected)}
                      className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-900"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {selected.description && (
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                {selected.description}
              </p>
            )}

            <div className="text-[11px] text-muted-foreground mb-2">
              {selected.deckSize} cards · targets sum to{" "}
              <span className="font-mono">{targetSum}</span>
              {targetSum > selected.deckSize && (
                <span className="text-amber-400/90">
                  {" "}
                  — {targetSum - selected.deckSize} cards must fill more than one role
                </span>
              )}
            </div>

            <ul className="border-t border-border">
              {selected.requirements.map((req) => {
                const role = rolesById.get(req.roleId);
                return (
                  <li
                    key={req.roleId}
                    className="flex items-baseline gap-3 py-2 border-b border-border/50"
                  >
                    <span className="font-mono text-sm w-8 text-right">{req.targetCount}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs">{role?.name ?? req.roleId}</span>
                      {role?.description && (
                        <span className="text-[11px] text-muted-foreground ml-2">
                          {role.description}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0">
                      {req.minCount ?? req.targetCount}
                      {req.maxCount !== null ? `–${req.maxCount}` : "+"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </FullHeightView>
  );
}
