-- Fix: two policies from 20260913120000_add_deck_versions recursed.
--
--   "Own decks" WITH CHECK        reads DeckVersion, whose policy reads Deck.
--   "Versions of own decks" CHECK reads DeckVersion itself (the parent check).
--
-- Postgres detects the cycle when planning, so EVERY Data API insert/update on
-- Deck and DeckVersion failed with "infinite recursion detected in policy" —
-- not just the cross-account cases the checks were written to stop. (Prisma
-- was unaffected: its connection bypasses RLS.)
--
-- The lookup moves into a SECURITY DEFINER function, which reads the tables as
-- their owner and so does not re-enter their policies.

CREATE SCHEMA IF NOT EXISTS private;

-- Not exposed through PostgREST (only `public` is), so this is callable from
-- policies but not as an RPC. Policies are evaluated with the caller's
-- privileges, so `authenticated` does need EXECUTE and USAGE.
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- True when `version_id` is a version of `deck_id` AND that deck belongs to the
-- caller. The auth.uid() check lives inside the function so that bypassing RLS
-- here cannot become a way to probe other accounts' ids.
CREATE FUNCTION private.is_own_version_of_deck(version_id text, deck_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."DeckVersion" v
    JOIN public."Deck" d ON d.id = v."deckId"
    WHERE v.id = version_id
      AND v."deckId" = deck_id
      AND d."userId" = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION private.is_own_version_of_deck(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_own_version_of_deck(text, text) TO authenticated;

DROP POLICY "Own decks" ON "Deck";

CREATE POLICY "Own decks" ON "Deck"
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = "userId")
  WITH CHECK (
    (SELECT auth.uid()) = "userId"
    AND ("currentVersionId" IS NULL OR private.is_own_version_of_deck("currentVersionId", "id"))
  );

DROP POLICY "Versions of own decks" ON "DeckVersion";

CREATE POLICY "Versions of own decks" ON "DeckVersion"
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckVersion"."deckId" AND d."userId" = (SELECT auth.uid())))
  WITH CHECK (
    EXISTS (SELECT 1 FROM "Deck" d WHERE d.id = "DeckVersion"."deckId" AND d."userId" = (SELECT auth.uid()))
    AND ("parentVersionId" IS NULL OR private.is_own_version_of_deck("parentVersionId", "deckId"))
  );
