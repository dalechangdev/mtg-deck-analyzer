-- Saved /prices runs (docs/plans/moxfield-prices.md, "History").
-- Hand-written for the same reason as 20260913130000_add_card_produced_mana:
-- `migrate dev` can't replay the RLS migration into a shadow database.

CREATE TABLE "PriceSearch" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "skipBasics" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT,
    "pricedCards" INTEGER NOT NULL,
    "totalCards" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceSearch_userId_createdAt_idx" ON "PriceSearch"("userId", "createdAt");

-- Prisma can't model a relation into auth, so the FK is declared by hand, as in
-- 20260910120000_add_ownership_and_rls. Deleting an account deletes its history.
ALTER TABLE "PriceSearch"
  ADD CONSTRAINT "PriceSearch_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;

-- Same shape as "Own cart". Guards the Data API only; Prisma bypasses RLS, so
-- every Prisma query on this table filters by requireUserId().
ALTER TABLE "PriceSearch" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own price searches" ON "PriceSearch"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "userId")
  WITH CHECK ((SELECT auth.uid()) = "userId");
