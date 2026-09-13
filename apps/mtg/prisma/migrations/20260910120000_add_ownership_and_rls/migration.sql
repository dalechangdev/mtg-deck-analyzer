-- Multi-tenancy: ownership columns, and Row Level Security over every table.
--
-- WHY RLS IS NEEDED EVEN THOUGH PRISMA IGNORES IT
-- ----------------------------------------------
-- Prisma connects as a privileged role that RLS does not constrain, so none of
-- these policies affect a single query the app makes. They are not defence in
-- depth for Prisma -- they are the ONLY thing standing in front of Supabase's
-- Data API. Every table in `public` is reachable over PostgREST with the anon
-- key, which ships to the browser by design. Without the policies below,
-- anyone could read every deck and every collection in the database with one
-- curl against /rest/v1/Deck.
--
-- So there are two enforcement layers, and they cover different attackers:
--   1. RLS            -> the Data API surface (browser, anon key)
--   2. Prisma queries -> must filter by userId in application code, because
--                        the database will not do it for them
-- Dropping either one silently exposes user data.
--
-- NULL OWNERSHIP
-- --------------
-- The ownership columns are nullable so this migration applies to a database
-- that already has rows. A NULL owner satisfies no policy, so pre-existing
-- rows are invisible through the Data API rather than public -- the safe
-- failure direction. To adopt existing local data into an account, backfill
-- before relying on it:
--
--   update "Deck"             set "userId"  = '<auth.users.id>' where "userId"  is null;
--   update "LibraryCard"      set "userId"  = '<auth.users.id>' where "userId"  is null;
--   update "ShoppingCartCard" set "userId"  = '<auth.users.id>' where "userId"  is null;
--   update "AnalysisTemplate" set "ownerId" = '<auth.users.id>' where "ownerId" is null and "isBuiltIn" = false;
--
-- Once every row is claimed, a follow-up migration should set the columns NOT
-- NULL so an unowned row becomes impossible rather than merely invisible.

-- DropIndex
DROP INDEX "AnalysisTemplate_name_key";

-- DropIndex
DROP INDEX "LibraryCard_cardId_key";

-- DropIndex
DROP INDEX "ShoppingCartCard_cardId_key";

-- AlterTable
ALTER TABLE "AnalysisTemplate" ADD COLUMN     "ownerId" UUID;

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "LibraryCard" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "ShoppingCartCard" ADD COLUMN     "userId" UUID;

-- CreateIndex
CREATE INDEX "AnalysisTemplate_ownerId_idx" ON "AnalysisTemplate"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisTemplate_ownerId_name_key" ON "AnalysisTemplate"("ownerId", "name");

-- CreateIndex
CREATE INDEX "Deck_userId_idx" ON "Deck"("userId");

-- CreateIndex
CREATE INDEX "LibraryCard_userId_idx" ON "LibraryCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCard_userId_cardId_key" ON "LibraryCard"("userId", "cardId");

-- CreateIndex
CREATE INDEX "ShoppingCartCard_userId_idx" ON "ShoppingCartCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingCartCard_userId_cardId_key" ON "ShoppingCartCard"("userId", "cardId");

-- ---------------------------------------------------------------------------
-- Foreign keys into auth.users
-- ---------------------------------------------------------------------------
-- Prisma cannot model a relation into another schema, so these are declared by
-- hand. ON DELETE CASCADE means deleting an account takes its decks, library
-- and private templates with it, which is what account deletion has to mean.
ALTER TABLE "Deck"
  ADD CONSTRAINT "Deck_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "LibraryCard"
  ADD CONSTRAINT "LibraryCard_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "ShoppingCartCard"
  ADD CONSTRAINT "ShoppingCartCard_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;

-- Deleting an account nulls out its templates rather than deleting them,
-- because a template may be attached to decks that outlive the owner's copy.
ALTER TABLE "AnalysisTemplate"
  ADD CONSTRAINT "AnalysisTemplate_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Every table in `public` gets RLS enabled, including the ones that end up
-- with no policy at all. A table with RLS enabled and no policy denies
-- everything to unprivileged roles, which is the correct answer for the
-- migrations bookkeeping table.

ALTER TABLE "Card"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardFace"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardPrinting"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardTheme"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeckTheme"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardRole"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleMatcher"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_CardToCardTheme"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deck"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeckCard"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardAnnotation"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeckCardRole"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeckTemplate"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_DeckToDeckTheme"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LibraryCard"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShoppingCartCard"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalysisTemplate"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TemplateRequirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations"  ENABLE ROW LEVEL SECURITY;

-- Bookkeeping table: no policy, and no grants either. Migration history is
-- nobody's business but the deploy pipeline's.
REVOKE ALL ON "_prisma_migrations" FROM anon, authenticated;

-- --- Shared reference data: the Scryfall catalogue and the role vocabulary ---
--
-- World readable, including signed out (the card browser is the SEO surface --
-- it has to render for anonymous visitors). No INSERT/UPDATE/DELETE policy
-- exists for these, so writes are denied to anon and authenticated alike; the
-- card sync runs through Prisma's privileged connection.
CREATE POLICY "Card is public"             ON "Card"             FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "CardFace is public"         ON "CardFace"         FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "CardPrinting is public"     ON "CardPrinting"     FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "CardTheme is public"        ON "CardTheme"        FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "DeckTheme is public"        ON "DeckTheme"        FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "CardRole is public"         ON "CardRole"         FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "RoleMatcher is public"      ON "RoleMatcher"      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "_CardToCardTheme is public" ON "_CardToCardTheme" FOR SELECT TO anon, authenticated USING (true);

-- --- Owned directly by an account ---
--
-- Each is `TO authenticated` PLUS an ownership predicate. `TO authenticated`
-- on its own would authenticate without authorising: every signed-in user
-- would read every row. UPDATE carries WITH CHECK as well as USING, otherwise
-- a user could hand their own row to somebody else by rewriting userId.
-- auth.uid() is wrapped in a subselect so the planner evaluates it once per
-- query rather than once per row.

CREATE POLICY "Own decks" ON "Deck"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "userId")
  WITH CHECK ((SELECT auth.uid()) = "userId");

CREATE POLICY "Own library" ON "LibraryCard"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "userId")
  WITH CHECK ((SELECT auth.uid()) = "userId");

CREATE POLICY "Own cart" ON "ShoppingCartCard"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "userId")
  WITH CHECK ((SELECT auth.uid()) = "userId");

-- Templates split by ownership: a NULL owner is a shared reference template
-- that everyone may read and nobody may modify (no policy grants a write on
-- those rows), while a private copy behaves like any other owned row.
CREATE POLICY "Shared templates are readable" ON "AnalysisTemplate"
  FOR SELECT TO anon, authenticated
  USING ("ownerId" IS NULL);

CREATE POLICY "Own templates" ON "AnalysisTemplate"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "ownerId")
  WITH CHECK ((SELECT auth.uid()) = "ownerId");

-- --- Owned through a parent row ---
--
-- These tables carry no userId of their own; ownership is whatever the parent
-- deck or template says. EXISTS against the parent is the whole check, and it
-- appears in WITH CHECK too so a row cannot be inserted into somebody else's
-- deck.

CREATE POLICY "Cards in own decks" ON "DeckCard"
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckCard"."deckId" AND d."userId" = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckCard"."deckId" AND d."userId" = (SELECT auth.uid())));

CREATE POLICY "Annotations on own decks" ON "CardAnnotation"
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "CardAnnotation"."deckId" AND d."userId" = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "CardAnnotation"."deckId" AND d."userId" = (SELECT auth.uid())));

CREATE POLICY "Roles on own decks" ON "DeckCardRole"
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckCardRole"."deckId" AND d."userId" = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckCardRole"."deckId" AND d."userId" = (SELECT auth.uid())));

CREATE POLICY "Templates on own decks" ON "DeckTemplate"
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckTemplate"."deckId" AND d."userId" = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckTemplate"."deckId" AND d."userId" = (SELECT auth.uid())));

-- Prisma's implicit many-to-many join table for Deck <-> DeckTheme. Column "A"
-- is the Deck side (Prisma orders the pair alphabetically by model name).
CREATE POLICY "Themes on own decks" ON "_DeckToDeckTheme"
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "_DeckToDeckTheme"."A" AND d."userId" = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "_DeckToDeckTheme"."A" AND d."userId" = (SELECT auth.uid())));

-- Requirements follow their template: readable when the template is shared,
-- writable only when the caller owns it.
CREATE POLICY "Requirements of shared templates are readable" ON "TemplateRequirement"
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM "AnalysisTemplate" t WHERE t.id = "TemplateRequirement"."templateId" AND t."ownerId" IS NULL));

CREATE POLICY "Requirements of own templates" ON "TemplateRequirement"
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "AnalysisTemplate" t WHERE t.id = "TemplateRequirement"."templateId" AND t."ownerId" = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM "AnalysisTemplate" t WHERE t.id = "TemplateRequirement"."templateId" AND t."ownerId" = (SELECT auth.uid())));
