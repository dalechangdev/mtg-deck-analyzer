-- Saved commanders (docs/plans/saved-commanders.md).
-- Hand-written for the same reason as 20260913130000_add_card_produced_mana:
-- `migrate dev` can't replay the RLS migration into a shadow database.

CREATE TABLE "SavedCommander" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "cardId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedCommander_pkey" PRIMARY KEY ("id")
);

-- The unique index leads with userId, so it also serves per-user lookups.
CREATE UNIQUE INDEX "SavedCommander_userId_cardId_key" ON "SavedCommander"("userId", "cardId");
CREATE INDEX "SavedCommander_cardId_idx" ON "SavedCommander"("cardId");

ALTER TABLE "SavedCommander"
  ADD CONSTRAINT "SavedCommander_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma can't model a relation into auth, so the FK is declared by hand, as in
-- 20260910120000_add_ownership_and_rls. Deleting an account deletes the list.
ALTER TABLE "SavedCommander"
  ADD CONSTRAINT "SavedCommander_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;

-- Same shape as "Own cart". Guards the Data API only; Prisma bypasses RLS, so
-- every Prisma query on this table filters by requireUserId().
ALTER TABLE "SavedCommander" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own saved commanders" ON "SavedCommander"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "userId")
  WITH CHECK ((SELECT auth.uid()) = "userId");

-- Tables created by a migration are invisible to the Data API roles until
-- granted (see 20260913120100_grant_deck_versions); the policy alone grants nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON "SavedCommander" TO authenticated;
