-- Scryfall Tagger oracle tags, for the analysis breakdown's Tag dimension.
-- Hand-written for the same reason as 20260913130000_add_card_produced_mana:
-- `migrate dev` can't replay the RLS migration into a shadow database.

CREATE TABLE "OracleTag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "parentIds" TEXT[],

    CONSTRAINT "OracleTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OracleTag_slug_key" ON "OracleTag"("slug");
CREATE UNIQUE INDEX "OracleTag_label_key" ON "OracleTag"("label");

CREATE TABLE "CardOracleTag" (
    "cardId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "direct" BOOLEAN NOT NULL,

    CONSTRAINT "CardOracleTag_pkey" PRIMARY KEY ("cardId","tagId")
);

CREATE INDEX "CardOracleTag_tagId_idx" ON "CardOracleTag"("tagId");

ALTER TABLE "CardOracleTag"
  ADD CONSTRAINT "CardOracleTag_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardOracleTag"
  ADD CONSTRAINT "CardOracleTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "OracleTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Public card data, same policy as "Card is public".
ALTER TABLE "OracleTag"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardOracleTag" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "OracleTag is public"     ON "OracleTag"     FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "CardOracleTag is public" ON "CardOracleTag" FOR SELECT TO anon, authenticated USING (true);

-- Tables created by a migration are invisible to the Data API roles until
-- granted (see 20260913120100_grant_deck_versions); the policy alone grants nothing.
GRANT SELECT ON "OracleTag", "CardOracleTag" TO anon, authenticated;
