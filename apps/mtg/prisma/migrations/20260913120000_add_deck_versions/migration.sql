-- Deck versions: a deck owns named versions, and each version owns a full copy
-- of its card list. See docs/plans/deck-versions.md.
--
-- Hand-written rather than generated: `prisma migrate dev` cannot build its
-- shadow database since 20260910120000_add_ownership_and_rls references the
-- Supabase `auth` schema. DDL names below match what Prisma generates for the
-- schema (checked with `prisma migrate diff --from-empty --to-schema`), so
-- future diffs see no drift.
--
-- Order matters: DeckCard's RLS policy references "deckId", so it has to be
-- dropped before the column can be, and the column cannot be dropped until
-- every row has been re-pointed at a version.

-- CreateEnum
CREATE TYPE "GameResult" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- CreateTable
CREATE TABLE "DeckVersion" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "parentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeckVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameLog" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "GameResult",
    "podSize" INTEGER,
    "opponents" TEXT,
    "turns" INTEGER,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN "currentVersionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deck_currentVersionId_key" ON "Deck"("currentVersionId");
CREATE INDEX "DeckVersion_parentVersionId_idx" ON "DeckVersion"("parentVersionId");
CREATE UNIQUE INDEX "DeckVersion_deckId_name_key" ON "DeckVersion"("deckId", "name");
CREATE INDEX "GameLog_versionId_playedAt_idx" ON "GameLog"("versionId", "playedAt");

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DeckVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeckVersion" ADD CONSTRAINT "DeckVersion_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeckVersion" ADD CONSTRAINT "DeckVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "DeckVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GameLog" ADD CONSTRAINT "GameLog_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DeckVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: every existing deck gets a "v1" holding its current cards, and
-- opens on it. Decks with no cards get a v1 too, so "every deck has a current
-- version" holds from here on. Ids are uuids rather than cuids — both are
-- opaque TEXT to the app.
-- ---------------------------------------------------------------------------

INSERT INTO "DeckVersion" ("id", "deckId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, d."id", 'v1', d."createdAt", CURRENT_TIMESTAMP
FROM "Deck" d;

UPDATE "Deck" d
SET "currentVersionId" = v."id"
FROM "DeckVersion" v
WHERE v."deckId" = d."id";

DROP POLICY "Cards in own decks" ON "DeckCard";

ALTER TABLE "DeckCard" ADD COLUMN "versionId" TEXT;

UPDATE "DeckCard" dc
SET "versionId" = d."currentVersionId"
FROM "Deck" d
WHERE d."id" = dc."deckId";

ALTER TABLE "DeckCard" ALTER COLUMN "versionId" SET NOT NULL;

-- DropForeignKey / DropIndex / DropColumn
ALTER TABLE "DeckCard" DROP CONSTRAINT "DeckCard_deckId_fkey";
DROP INDEX "DeckCard_deckId_cardId_key";
DROP INDEX "DeckCard_deckId_idx";
ALTER TABLE "DeckCard" DROP COLUMN "deckId";

-- CreateIndex. Leads with versionId, so it also serves "all cards in a version";
-- no separate versionId index.
CREATE UNIQUE INDEX "DeckCard_versionId_cardId_key" ON "DeckCard"("versionId", "cardId");

-- AddForeignKey
ALTER TABLE "DeckCard" ADD CONSTRAINT "DeckCard_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DeckVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row Level Security — same shape as 20260910120000_add_ownership_and_rls.
-- Reminder: Prisma's connection bypasses all of this. These policies guard the
-- Data API only; requireVersionAccess() in src/lib/ownership.ts guards Prisma.
-- ---------------------------------------------------------------------------

ALTER TABLE "DeckVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameLog"     ENABLE ROW LEVEL SECURITY;

-- A version belongs to whoever owns its deck. WITH CHECK also pins the parent
-- to the same deck, so a version can't claim lineage from another account's.
CREATE POLICY "Versions of own decks" ON "DeckVersion"
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckVersion"."deckId" AND d."userId" = (SELECT auth.uid())))
  WITH CHECK (
    EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckVersion"."deckId" AND d."userId" = (SELECT auth.uid()))
    AND (
      "parentVersionId" IS NULL
      OR EXISTS (SELECT 1 FROM "DeckVersion" p WHERE p.id = "DeckVersion"."parentVersionId" AND p."deckId" = "DeckVersion"."deckId")
    )
  );

-- Two hops now: card -> version -> deck.
CREATE POLICY "Cards in own decks" ON "DeckCard"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "DeckVersion" v JOIN "Deck" d ON d.id = v."deckId"
    WHERE v.id = "DeckCard"."versionId" AND d."userId" = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "DeckVersion" v JOIN "Deck" d ON d.id = v."deckId"
    WHERE v.id = "DeckCard"."versionId" AND d."userId" = (SELECT auth.uid())
  ));

CREATE POLICY "Games of own decks" ON "GameLog"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "DeckVersion" v JOIN "Deck" d ON d.id = v."deckId"
    WHERE v.id = "GameLog"."versionId" AND d."userId" = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "DeckVersion" v JOIN "Deck" d ON d.id = v."deckId"
    WHERE v.id = "GameLog"."versionId" AND d."userId" = (SELECT auth.uid())
  ));

-- "Own decks" only checked userId, which would let a Data API caller point
-- their deck's currentVersionId at a version of somebody else's deck. Reading
-- it would still be denied, but currentVersionId is UNIQUE, so the squatted id
-- could then never become the real owner's current version. WITH CHECK now
-- also requires the current version to belong to this deck.
DROP POLICY "Own decks" ON "Deck";

CREATE POLICY "Own decks" ON "Deck"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "userId")
  WITH CHECK (
    (SELECT auth.uid()) = "userId"
    AND (
      "currentVersionId" IS NULL
      OR EXISTS (SELECT 1 FROM "DeckVersion" v WHERE v.id = "Deck"."currentVersionId" AND v."deckId" = "Deck"."id")
    )
  );
