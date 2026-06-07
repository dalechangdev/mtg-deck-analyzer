"use client";

import { useState } from "react";
import { CardDetailModal, type CardDetail } from "./card-detail-modal";

const COLOR_DOT: Record<string, string> = {
  W: "bg-yellow-100 border-yellow-400",
  U: "bg-blue-500",
  B: "bg-zinc-800",
  R: "bg-red-500",
  G: "bg-green-600",
};

export function CardThumbnail({ card }: { card: CardDetail }) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className="relative group cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setOpen(true)}
      >
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={card.name}
            className="rounded-xl w-full aspect-[63/88] object-cover shadow-md group-hover:shadow-xl transition-shadow"
            loading="lazy"
          />
        ) : (
          <div className="rounded-xl w-full aspect-[63/88] bg-muted flex flex-col items-center justify-center p-3 gap-1 shadow-md">
            <span className="text-xs font-medium text-center leading-tight">{card.name}</span>
            <span className="text-xs text-muted-foreground text-center">{card.typeLine}</span>
            <div className="flex gap-1 mt-1">
              {card.colorIdentity.map((c) => (
                <span key={c} className={`w-3 h-3 rounded-full border ${COLOR_DOT[c] ?? "bg-zinc-500"}`} />
              ))}
            </div>
          </div>
        )}

        {hovered && !open && (
          <div className="absolute z-40 left-full top-0 ml-2 w-56 rounded-lg border border-border bg-popover p-3 shadow-xl text-xs space-y-1 pointer-events-none">
            <div className="font-semibold text-sm">{card.name}</div>
            {card.manaCost && <div className="text-muted-foreground font-mono">{card.manaCost}</div>}
            <div className="text-muted-foreground italic">{card.typeLine}</div>
            {card.oracleText && (
              <div className="text-foreground/80 whitespace-pre-wrap border-t border-border pt-1 mt-1">
                {card.oracleText}
              </div>
            )}
            {card.canBeCommander && (
              <div className="text-amber-400 font-medium pt-1">⭐ Can be Commander</div>
            )}
          </div>
        )}
      </div>

      {open && <CardDetailModal card={card} onClose={() => setOpen(false)} />}
    </>
  );
}
