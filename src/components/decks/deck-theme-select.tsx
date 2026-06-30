"use client";
import { Popover } from "@base-ui/react/popover";
import { Checkbox } from "@base-ui/react/checkbox";
import { ChevronDown, Check } from "lucide-react";

const CATEGORIES: { label: string; ids: string[] }[] = [
  {
    label: "Archetypes",
    ids: ["aggro", "control", "combo", "midrange", "tempo", "stax"],
  },
  {
    label: "Mechanics",
    ids: [
      "ramp", "spellslinger", "tokens", "aristocrats", "reanimator", "graveyard",
      "storm", "infect", "voltron", "pillowfort", "tribal", "enchantress",
      "artifacts", "equipment", "lands", "mill", "chaos", "group-hug",
      "flash", "blink", "sacrifice", "card-draw", "lifegain", "lifedrain",
      "plus-counters", "minus-counters", "copy", "superfriends", "politics",
    ],
  },
];

interface Props {
  allThemes: { id: string; name: string }[];
  selectedIds: string[];
  onToggle: (id: string, selected: boolean) => void;
}

export function DeckThemeSelect({ allThemes, selectedIds, onToggle }: Props) {
  const themeMap = new Map(allThemes.map((t) => [t.id, t.name]));

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {selectedIds.map((id) => (
        <span
          key={id}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30"
        >
          {themeMap.get(id) ?? id}
          <button
            onClick={() => onToggle(id, false)}
            className="text-primary/60 hover:text-primary leading-none"
          >
            ×
          </button>
        </span>
      ))}

      <Popover.Root>
        <Popover.Trigger className="text-[11px] px-2 py-0.5 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground flex items-center gap-1 transition-colors">
          {selectedIds.length === 0 ? "Add themes" : "+"}
          <ChevronDown size={10} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="start">
            <Popover.Popup className="bg-card border border-border rounded-lg shadow-xl p-3 w-56 max-h-72 overflow-y-auto z-50">
              {CATEGORIES.map((cat) => {
                const catThemes = cat.ids
                  .filter((id) => themeMap.has(id))
                  .map((id) => ({ id, name: themeMap.get(id)! }));
                if (catThemes.length === 0) return null;
                return (
                  <div key={cat.label} className="mb-3 last:mb-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                      {cat.label}
                    </div>
                    <div className="space-y-px">
                      {catThemes.map((theme) => {
                        const checked = selectedIds.includes(theme.id);
                        return (
                          <label
                            key={theme.id}
                            className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted/40 transition-colors"
                          >
                            <Checkbox.Root
                              checked={checked}
                              onCheckedChange={(val) => onToggle(theme.id, val as boolean)}
                              className="w-3.5 h-3.5 rounded-sm border border-border flex items-center justify-center bg-background data-[checked]:bg-primary data-[checked]:border-primary transition-colors flex-shrink-0"
                            >
                              <Checkbox.Indicator className="text-primary-foreground flex items-center justify-center">
                                <Check size={9} strokeWidth={3} />
                              </Checkbox.Indicator>
                            </Checkbox.Root>
                            <span className="text-xs">{theme.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
