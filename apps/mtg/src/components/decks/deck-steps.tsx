"use client";

import Link from "next/link";
import { deckPageUrl } from "@/lib/deck-api";

/**
 * The three stages of a build: pick a commander, pile up everything that might
 * make it, then cut the pile down to a deck. Steps are guidance, not gates —
 * every one of them is reachable at any time.
 */
export type BuildStep = "commander" | "potential" | "analysis";

interface Props {
  deckId: string;
  /** Links stay on this version. */
  versionId: string;
  current: BuildStep;
  commanderName: string | null;
  potentialCount: number;
  mainCount: number;
  deckSize?: number;
  /** Supplied by the builder, where steps 1 and 2 are the same screen. */
  onStep?: (step: Exclude<BuildStep, "analysis">) => void;
}

export function DeckSteps({
  deckId,
  versionId,
  current,
  commanderName,
  potentialCount,
  mainCount,
  deckSize = 100,
  onStep,
}: Props) {
  const steps: {
    key: BuildStep;
    n: number;
    label: string;
    detail: string;
    done: boolean;
    href?: string;
  }[] = [
    {
      key: "commander",
      n: 1,
      label: "Commander",
      detail: commanderName ?? "Not chosen",
      done: commanderName !== null,
      href: onStep ? undefined : deckPageUrl(deckId, versionId, "", { step: "commander" }),
    },
    {
      key: "potential",
      n: 2,
      label: "Potential",
      detail: `${potentialCount} card${potentialCount === 1 ? "" : "s"}`,
      done: potentialCount > 0,
      href: onStep ? undefined : deckPageUrl(deckId, versionId),
    },
    {
      key: "analysis",
      n: 3,
      label: "Analysis",
      detail: `${mainCount} / ${deckSize} in deck`,
      done: mainCount >= deckSize,
      href: deckPageUrl(deckId, versionId, "/analysis"),
    },
  ];

  return (
    <nav
      aria-label="Deck building steps"
      className="flex items-center gap-1 px-4 py-1.5 border-b border-border flex-shrink-0"
    >
      {steps.map((step, i) => {
        const active = step.key === current;
        const className = `flex items-center gap-2 px-2.5 py-1 rounded-md border transition-colors text-left ${
          active
            ? "border-primary bg-primary/10 text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`;

        const body = (
          <>
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-micro font-bold flex-shrink-0 ${
                active
                  ? "bg-primary text-primary-foreground"
                  : step.done
                    ? "bg-success-surface-strong text-success"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step.done && !active ? "✓" : step.n}
            </span>
            <span className="min-w-0">
              <span className="block text-body font-medium leading-tight">{step.label}</span>
              <span className="block text-micro text-muted-foreground truncate max-w-40 leading-tight">
                {step.detail}
              </span>
            </span>
          </>
        );

        return (
          <div key={step.key} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-muted-foreground/50">→</span>}
            {step.href ? (
              <Link href={step.href} className={className} aria-current={active ? "step" : undefined}>
                {body}
              </Link>
            ) : (
              <button
                onClick={() => onStep?.(step.key as Exclude<BuildStep, "analysis">)}
                className={className}
                aria-current={active ? "step" : undefined}
              >
                {body}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
