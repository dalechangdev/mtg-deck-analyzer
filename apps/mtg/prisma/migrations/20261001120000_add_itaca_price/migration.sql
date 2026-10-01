-- Ítaca price cache for /prices (docs/plans/moxfield-prices.md).
-- Hand-written for the same reason as 20260913130000_add_card_produced_mana:
-- `migrate dev` can't replay the RLS migration into a shadow database.

CREATE TABLE "ItacaPrice" (
    "cardId" TEXT NOT NULL,
    "setCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lowestPriceCents" INTEGER,
    "currency" TEXT,
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItacaPrice_pkey" PRIMARY KEY ("cardId","setCode")
);

-- Only Prisma (privileged, RLS-exempt) reads or writes this table. RLS on with
-- no policies keeps it out of the Data API entirely.
ALTER TABLE "ItacaPrice" ENABLE ROW LEVEL SECURITY;
