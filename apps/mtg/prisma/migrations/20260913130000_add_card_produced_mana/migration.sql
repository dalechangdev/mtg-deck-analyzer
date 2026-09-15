-- Scryfall's produced_mana, for the land base matrix (docs/plans/land-base-matrix.md).
-- Written by hand: `migrate dev` can't replay the RLS migration into a plain
-- shadow database (no `auth` schema). Existing rows get '{}' until the next
-- `sync:cards`; the land analysis falls back to oracle text for those.
-- No GRANT needed — Card's grants are table-level, so they cover new columns.
ALTER TABLE "Card" ADD COLUMN "producedMana" TEXT[] DEFAULT ARRAY[]::TEXT[];
