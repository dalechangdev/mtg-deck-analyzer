-- Scryfall's layout, so the land base matrix can tell a spell // land MDFC from a
-- transform card with a land back (docs/plans/land-base-matrix.md).
-- Hand-written for the same reason as 20260913130000_add_card_produced_mana:
-- `migrate dev` can't replay the RLS migration into a shadow database.
-- Nullable: rows read as unknown, not "normal", until the next `sync:cards`.
-- No GRANT needed — Card's grants are table-level.
ALTER TABLE "Card" ADD COLUMN "layout" TEXT;
