"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export interface CardFaceDetail {
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  imageUrl: string | null;
}

export interface CardDetail {
  id: string;
  name: string;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  oracleText: string | null;
  colorIdentity: string[];
  keywords: string[];
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  canBeCommander: boolean;
  imageUrl: string | null; // normal — used for the grid thumbnail
  largeImageUrl: string | null; // large — used here in the modal
  setName: string | null;
  setCode: string | null;
  rarity: string | null;
  collectorNumber: string | null;
  scryfallUri: string | null;
  faces: CardFaceDetail[];
}

const COLOR_DOT: Record<string, string> = {
  W: "bg-yellow-100 border-yellow-400",
  U: "bg-blue-500",
  B: "bg-zinc-800",
  R: "bg-red-500",
  G: "bg-green-600",
};

const RARITY_STYLE: Record<string, string> = {
  common: "bg-zinc-700 text-zinc-100",
  uncommon: "bg-slate-400 text-slate-900",
  rare: "bg-amber-400 text-amber-950",
  mythic: "bg-orange-600 text-white",
};

function ptLine(power: string | null, toughness: string | null, loyalty: string | null) {
  if (power != null && toughness != null) return `${power} / ${toughness}`;
  if (loyalty != null) return `Loyalty ${loyalty}`;
  return null;
}

export function CardDetailModal({ card, onClose }: { card: CardDetail; onClose: () => void }) {
  const hasMultipleFaces = card.faces.length > 1;
  const [faceIndex, setFaceIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [ownedQty, setOwnedQty] = useState<number | null>(null);
  const [addError, setAddError] = useState(false);

  const addToLibrary = async () => {
    if (adding) return;
    setAdding(true);
    setAddError(false);
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id }),
      });
      if (!res.ok) throw new Error("request failed");
      const { quantity } = await res.json();
      setOwnedQty(quantity);
    } catch {
      setAddError(true);
    } finally {
      setAdding(false);
    }
  };

  // Close on Escape and lock background scroll while open.
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

  const activeFace = hasMultipleFaces ? card.faces[faceIndex] : null;
  const image = activeFace?.imageUrl ?? card.largeImageUrl ?? card.imageUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl sm:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-muted-foreground hover:bg-background hover:text-foreground"
        >
          ✕
        </button>

        {/* Image */}
        <div className="flex flex-shrink-0 flex-col items-center gap-2 bg-muted/30 p-4 sm:w-[300px]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={activeFace?.name ?? card.name}
              className="w-[260px] max-w-full rounded-xl shadow-lg"
            />
          ) : (
            <div className="flex aspect-[63/88] w-[260px] max-w-full items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">
              No image
            </div>
          )}
          {hasMultipleFaces && (
            <button
              onClick={() => setFaceIndex((i) => (i + 1) % card.faces.length)}
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              ⟲ Flip · {card.faces[(faceIndex + 1) % card.faces.length].name}
            </button>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 overflow-y-auto p-5">
          {hasMultipleFaces ? (
            <div className="space-y-4">
              {card.faces.map((face, i) => (
                <FaceBlock key={i} face={face} active={i === faceIndex} onSelect={() => setFaceIndex(i)} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3 pr-6">
                <h2 className="text-lg font-semibold leading-tight">{card.name}</h2>
                {card.manaCost && (
                  <span className="flex-shrink-0 font-mono text-sm text-muted-foreground">{card.manaCost}</span>
                )}
              </div>
              <p className="text-sm italic text-muted-foreground">{card.typeLine}</p>
              {card.oracleText && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{card.oracleText}</p>
              )}
              {ptLine(card.power, card.toughness, card.loyalty) && (
                <p className="text-sm font-semibold">{ptLine(card.power, card.toughness, card.loyalty)}</p>
              )}
            </div>
          )}

          {/* Metadata footer — shared across all cards */}
          <div className="mt-5 space-y-3 border-t border-border pt-4 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
              <span>
                Mana value <span className="font-medium text-foreground">{card.cmc}</span>
              </span>
              {card.colorIdentity.length > 0 ? (
                <span className="flex items-center gap-1">
                  Color identity
                  {card.colorIdentity.map((c) => (
                    <span key={c} className={`h-3.5 w-3.5 rounded-full border ${COLOR_DOT[c] ?? "bg-zinc-500"}`} />
                  ))}
                </span>
              ) : (
                <span>Colorless</span>
              )}
              {card.setName && (
                <span>
                  {card.setName}
                  {card.collectorNumber ? ` · #${card.collectorNumber}` : ""}
                </span>
              )}
              {card.rarity && (
                <span
                  className={`rounded px-1.5 py-0.5 font-medium capitalize ${RARITY_STYLE[card.rarity] ?? "bg-zinc-700 text-zinc-100"}`}
                >
                  {card.rarity}
                </span>
              )}
            </div>

            {card.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {card.keywords.map((kw) => (
                  <Badge key={kw} variant="outline">
                    {kw}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={addToLibrary}
                disabled={adding}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {adding ? "Adding…" : ownedQty != null ? "Add another copy" : "+ Add to Library"}
              </button>
              {ownedQty != null && (
                <span className="font-medium text-emerald-400">
                  ✓ {ownedQty} in library
                </span>
              )}
              {addError && <span className="text-destructive">Couldn&apos;t add — try again.</span>}
              {card.canBeCommander && <span className="font-medium text-amber-400">⭐ Can be your Commander</span>}
              {card.scryfallUri && (
                <a
                  href={card.scryfallUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  View on Scryfall ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FaceBlock({ face, active, onSelect }: { face: CardFaceDetail; active: boolean; onSelect: () => void }) {
  const pt = ptLine(face.power, face.toughness, face.loyalty);
  return (
    <button
      onClick={onSelect}
      className={`block w-full rounded-lg border p-3 text-left transition-colors ${
        active ? "border-border bg-muted/40" : "border-transparent hover:bg-muted/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-tight">{face.name}</h3>
        {face.manaCost && <span className="flex-shrink-0 font-mono text-sm text-muted-foreground">{face.manaCost}</span>}
      </div>
      <p className="mt-0.5 text-sm italic text-muted-foreground">{face.typeLine}</p>
      {face.oracleText && (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{face.oracleText}</p>
      )}
      {pt && <p className="mt-1.5 text-sm font-semibold">{pt}</p>}
    </button>
  );
}
