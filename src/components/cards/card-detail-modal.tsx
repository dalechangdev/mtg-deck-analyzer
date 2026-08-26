"use client";

import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { DialogTitle } from "@/components/ui/dialog";
import { Modal, ModalCloseButton } from "@/components/ui/modal";
import { MANA_PIP, rarityStyle } from "@/lib/mtg-styles";
import { Button } from "@/components/ui/button";

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

function ptLine(power: string | null, toughness: string | null, loyalty: string | null) {
  if (power != null && toughness != null) return `${power} / ${toughness}`;
  if (loyalty != null) return `Loyalty ${loyalty}`;
  return null;
}

interface ItacaPricing {
  url: string;
  inStock: boolean;
  lowestPrice: number | null;
  currency: string | null;
}

export function CardDetailModal({
  card,
  onClose,
  actions,
}: {
  card: CardDetail;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const hasMultipleFaces = card.faces.length > 1;
  const [faceIndex, setFaceIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [ownedQty, setOwnedQty] = useState<number | null>(null);
  const [addError, setAddError] = useState(false);
  const [pricing, setPricing] = useState<ItacaPricing | null | undefined>(undefined);
  const [addingToCart, setAddingToCart] = useState(false);
  const [interested, setInterested] = useState(false);
  const [cartError, setCartError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPricing(undefined);
    fetch(`/api/cards/${card.id}/price`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setPricing(data);
      })
      .catch(() => {
        if (!cancelled) setPricing(null);
      });
    return () => {
      cancelled = true;
    };
  }, [card.id]);

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

  const addToCart = async () => {
    if (addingToCart || interested) return;
    setAddingToCart(true);
    setCartError(false);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id }),
      });
      if (!res.ok) throw new Error("request failed");
      setInterested(true);
    } catch {
      setCartError(true);
    } finally {
      setAddingToCart(false);
    }
  };

  const activeFace = hasMultipleFaces ? card.faces[faceIndex] : null;
  const image = activeFace?.imageUrl ?? card.largeImageUrl ?? card.imageUrl;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      className="max-h-[90vh] sm:flex-row"
    >
      {/* No visible header bar, so the accessible name comes from here. */}
      <DialogTitle className="sr-only">{card.name}</DialogTitle>

      <ModalCloseButton className="absolute right-3 top-3 z-10 bg-background/70 hover:bg-background" />

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
            <div className="flex aspect-[63/88] w-[260px] max-w-full items-center justify-center rounded-xl bg-muted text-body text-muted-foreground">
              No image
            </div>
          )}
          {hasMultipleFaces && (
            <Button
              onClick={() => setFaceIndex((i) => (i + 1) % card.faces.length)}
              variant="outline" size="sm"
            >
              ⟲ Flip · {card.faces[(faceIndex + 1) % card.faces.length].name}
            </Button>
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
                  <span className="flex-shrink-0 font-mono text-ui text-muted-foreground">{card.manaCost}</span>
                )}
              </div>
              <p className="text-ui italic text-muted-foreground">{card.typeLine}</p>
              {card.oracleText && (
                <p className="whitespace-pre-wrap text-ui leading-relaxed text-foreground/90">{card.oracleText}</p>
              )}
              {ptLine(card.power, card.toughness, card.loyalty) && (
                <p className="text-ui font-semibold">{ptLine(card.power, card.toughness, card.loyalty)}</p>
              )}
            </div>
          )}

          {/* Metadata footer — shared across all cards */}
          <div className="mt-5 space-y-3 border-t border-border pt-4 text-body">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
              <span>
                Mana value <span className="font-medium text-foreground">{card.cmc}</span>
              </span>
              {card.colorIdentity.length > 0 ? (
                <span className="flex items-center gap-1">
                  Color identity
                  {card.colorIdentity.map((c) => (
                    <span key={c} className={`h-3.5 w-3.5 rounded-full border ${MANA_PIP[c] ?? "bg-muted-foreground"}`} />
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
                  className={`rounded-md px-1.5 py-0.5 font-medium capitalize ${rarityStyle(card.rarity)}`}
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
              {actions ?? (
                <>
                  <Button
                    onClick={addToLibrary}
                    disabled={adding}
                    size="sm"
                  >
                    {adding ? "Adding…" : ownedQty != null ? "Add another copy" : "+ Add to Library"}
                  </Button>
                  {ownedQty != null && (
                    <span className="font-medium text-success">
                      ✓ {ownedQty} in library
                    </span>
                  )}
                  {addError && <span className="text-destructive">Couldn&apos;t add — try again.</span>}

                  <Button
                    onClick={addToCart}
                    disabled={addingToCart || interested}
                    variant="outline" size="sm"
                  >
                    {interested ? "✓ Interested" : addingToCart ? "Adding…" : "☆ Interested"}
                  </Button>
                  {cartError && <span className="text-destructive">Couldn&apos;t add — try again.</span>}
                </>
              )}
              {card.canBeCommander && <span className="font-medium text-warning">⭐ Can be your Commander</span>}
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
              {pricing && (
                <a
                  href={pricing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {pricing.inStock && pricing.lowestPrice != null
                    ? `Itaca.gg from €${pricing.lowestPrice.toFixed(2)} ↗`
                    : "Itaca.gg (out of stock) ↗"}
                </a>
              )}
            </div>
          </div>
        </div>
    </Modal>
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
        <h3 className="text-lead font-semibold leading-tight">{face.name}</h3>
        {face.manaCost && <span className="flex-shrink-0 font-mono text-ui text-muted-foreground">{face.manaCost}</span>}
      </div>
      <p className="mt-0.5 text-ui italic text-muted-foreground">{face.typeLine}</p>
      {face.oracleText && (
        <p className="mt-1.5 whitespace-pre-wrap text-ui leading-relaxed text-foreground/90">{face.oracleText}</p>
      )}
      {pt && <p className="mt-1.5 text-ui font-semibold">{pt}</p>}
    </button>
  );
}
