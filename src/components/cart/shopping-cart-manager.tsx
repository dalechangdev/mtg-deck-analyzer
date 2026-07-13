"use client";

import { useState } from "react";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import type { CardDetail } from "@/components/cards/card-detail-modal";

export interface CartEntry {
  cartItemId: string;
  card: CardDetail;
}

export function ShoppingCartManager({ initialEntries }: { initialEntries: CartEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);

  const remove = async (cartItemId: string) => {
    setEntries((prev) => prev.filter((e) => e.cartItemId !== cartItemId));
    await fetch(`/api/cart/${cartItemId}`, { method: "DELETE" });
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <h1 className="text-xl font-semibold">Shopping Cart</h1>

      <p className="text-sm text-muted-foreground">
        {entries.length === 0
          ? "No cards yet — mark cards “Interested” from the Cards browser to add them here."
          : `${entries.length} card${entries.length !== 1 ? "s" : ""}`}
      </p>

      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {entries.map((entry) => (
            <div key={entry.cartItemId} className="relative">
              <button
                onClick={() => remove(entry.cartItemId)}
                title="Remove from cart"
                className="absolute -right-1.5 -top-1.5 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow hover:border-destructive hover:text-destructive"
              >
                ✕
              </button>
              <CardThumbnail card={entry.card} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
