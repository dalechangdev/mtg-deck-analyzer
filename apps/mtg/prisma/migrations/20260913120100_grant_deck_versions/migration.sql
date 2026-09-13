-- Table privileges for the tables added in 20260913120000_add_deck_versions.
--
-- This database has no default privileges on `public`, so a table created by a
-- migration is invisible to the Data API roles until granted — RLS policies on
-- their own grant nothing. (The grants on the older tables were applied outside
-- the migration history.)
--
-- authenticated only: every policy on these tables is TO authenticated, so anon
-- would get zero rows anyway. No TRUNCATE: it is not subject to RLS.

GRANT SELECT, INSERT, UPDATE, DELETE ON "DeckVersion" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "GameLog"     TO authenticated;
