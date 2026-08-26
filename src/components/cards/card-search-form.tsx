"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { COLOR_LABELS, COLOR_ORDER, MANA_CHIP } from "@/lib/mtg-styles";

interface Props {
  initialQ: string;
  initialColors: string[];
  initialCommanderOnly: boolean;
}

export function CardSearchForm({ initialQ, initialColors, initialCommanderOnly }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const push = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      params.delete("page");
      startTransition(() => router.push(`/cards?${params.toString()}`));
    },
    [router, searchParams]
  );

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q") as string;
    push({ q });
  }

  function toggleColor(key: string) {
    const current = new Set(initialColors);
    current.has(key) ? current.delete(key) : current.add(key);
    push({ colors: current.size > 0 ? [...current].join(",") : null });
  }

  function toggleCommander() {
    push({ commander: initialCommanderOnly ? null : "1" });
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <Input
          name="q"
          defaultValue={initialQ}
          placeholder="Search cards…"
          className="flex-1"
        />
        <button
          type="submit"
          
        >
          Search
        </button>
      </form>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-ui text-muted-foreground">Color identity:</span>
        {COLOR_ORDER.map((key) => {
          const active = initialColors.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggleColor(key)}
              title={COLOR_LABELS[key]}
              className={`w-7 h-7 rounded-full border-2 font-bold text-body transition-all ${MANA_CHIP[key]} ${
                active ? "scale-110 ring-2 ring-offset-2 ring-offset-background ring-foreground/40" : "opacity-50"
              }`}
            >
              {key}
            </button>
          );
        })}
        <button
          onClick={toggleCommander}
          className={`ml-2 px-3 py-1 rounded-full text-body font-medium border transition-colors ${
            initialCommanderOnly
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Commanders only
        </button>
      </div>
    </div>
  );
}
