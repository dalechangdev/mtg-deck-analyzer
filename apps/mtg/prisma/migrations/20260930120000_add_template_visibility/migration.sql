-- Public templates: private until the owner publishes, then viewable and
-- cloneable by everyone (docs/plans/template-library.md).
--
-- Hand-written for the same reason as 20260913130000_add_card_produced_mana:
-- `migrate dev` can't replay the RLS migration into a shadow database. The DDL
-- is what `prisma migrate diff` generates for the schema change, so later diffs
-- see no drift. No GRANT needed — AnalysisTemplate's grants are table-level.

ALTER TABLE "AnalysisTemplate" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "sourceTemplateId" TEXT;

CREATE INDEX "AnalysisTemplate_isPublic_publishedAt_idx" ON "AnalysisTemplate"("isPublic", "publishedAt");

CREATE INDEX "AnalysisTemplate_sourceTemplateId_idx" ON "AnalysisTemplate"("sourceTemplateId");

ALTER TABLE "AnalysisTemplate" ADD CONSTRAINT "AnalysisTemplate_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "AnalysisTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Read-only, mirroring the shared-template policies in
-- 20260910120000_add_ownership_and_rls. Writes still go through
-- "Own templates" / "Requirements of own templates", so publishing is the
-- owner's call alone. anon included for parity with shared templates; the app
-- itself only serves Browse to signed-in users.

CREATE POLICY "Public templates are readable" ON "AnalysisTemplate"
  FOR SELECT TO anon, authenticated
  USING ("isPublic");

CREATE POLICY "Requirements of public templates are readable" ON "TemplateRequirement"
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM "AnalysisTemplate" t WHERE t.id = "TemplateRequirement"."templateId" AND t."isPublic"));
