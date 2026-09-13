-- CreateEnum
CREATE TYPE "RoleMatcherKind" AS ENUM ('CLASSIFIER', 'THEME', 'TYPE_LINE', 'ORACLE_REGEX', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "RoleAssignment" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateTable
CREATE TABLE "CardRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CardRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleMatcher" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "kind" "RoleMatcherKind" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "RoleMatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" TEXT NOT NULL DEFAULT 'commander',
    "deckSize" INTEGER NOT NULL DEFAULT 100,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRequirement" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "minCount" INTEGER,
    "maxCount" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "TemplateRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckTemplate" (
    "deckId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckTemplate_pkey" PRIMARY KEY ("deckId","templateId")
);

-- CreateTable
CREATE TABLE "DeckCardRole" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignment" "RoleAssignment" NOT NULL DEFAULT 'INCLUDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeckCardRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardRole_name_key" ON "CardRole"("name");

-- CreateIndex
CREATE INDEX "RoleMatcher_roleId_idx" ON "RoleMatcher"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisTemplate_name_key" ON "AnalysisTemplate"("name");

-- CreateIndex
CREATE INDEX "TemplateRequirement_templateId_idx" ON "TemplateRequirement"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRequirement_templateId_roleId_key" ON "TemplateRequirement"("templateId", "roleId");

-- CreateIndex
CREATE INDEX "DeckTemplate_templateId_idx" ON "DeckTemplate"("templateId");

-- CreateIndex
CREATE INDEX "DeckCardRole_deckId_idx" ON "DeckCardRole"("deckId");

-- CreateIndex
CREATE INDEX "DeckCardRole_cardId_idx" ON "DeckCardRole"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "DeckCardRole_deckId_cardId_roleId_key" ON "DeckCardRole"("deckId", "cardId", "roleId");

-- AddForeignKey
ALTER TABLE "RoleMatcher" ADD CONSTRAINT "RoleMatcher_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CardRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRequirement" ADD CONSTRAINT "TemplateRequirement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AnalysisTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRequirement" ADD CONSTRAINT "TemplateRequirement_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CardRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckTemplate" ADD CONSTRAINT "DeckTemplate_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckTemplate" ADD CONSTRAINT "DeckTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AnalysisTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCardRole" ADD CONSTRAINT "DeckCardRole_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCardRole" ADD CONSTRAINT "DeckCardRole_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCardRole" ADD CONSTRAINT "DeckCardRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CardRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the built-in roles
INSERT INTO "CardRole" ("id", "name", "description", "isBuiltIn") VALUES
  ('ramp',                'Ramp',                'Accelerates mana beyond the one-land-per-turn curve', true),
  ('card-advantage',      'Card Advantage',      'Nets extra cards or repeatable card selection', true),
  ('targeted-disruption', 'Targeted Disruption', 'Answers a single permanent, spell, or player', true),
  ('mass-disruption',     'Mass Disruption',     'Answers several permanents at once', true),
  ('land',                'Land',                'Land cards, including basics', true),
  ('identity',            'Identity / Plan',     'Cards that execute this deck''s specific plan — deck-relative, assigned by hand', true)
ON CONFLICT ("id") DO NOTHING;

-- Seed the matchers. A card fills a role if ANY matcher hits.
-- CLASSIFIER values must be registered in CLASSIFIERS in src/lib/deck-template.ts.
-- THEME values must be existing CardTheme ids.
INSERT INTO "RoleMatcher" ("id", "roleId", "kind", "value") VALUES
  ('m-ramp-classifier',   'ramp',                'CLASSIFIER',   'isManaRamp'),
  ('m-ramp-theme',        'ramp',                'THEME',        'mana-ramp'),

  ('m-adv-theme',         'card-advantage',      'THEME',        'card-draw'),
  ('m-adv-regex',         'card-advantage',      'ORACLE_REGEX', 'draw (a|two|three|four|[0-9x]+) cards?'),

  ('m-targeted-theme',    'targeted-disruption', 'THEME',        'removal'),
  ('m-targeted-counter',  'targeted-disruption', 'THEME',        'counterspell'),
  ('m-targeted-regex',    'targeted-disruption', 'ORACLE_REGEX', '(destroy|exile) target|counter target (spell|ability)'),

  ('m-mass-classifier',   'mass-disruption',     'CLASSIFIER',   'isBoardClear'),
  ('m-mass-theme',        'mass-disruption',     'THEME',        'board-wipe'),

  ('m-land-type',         'land',                'TYPE_LINE',    'Land'),

  ('m-identity-manual',   'identity',            'MANUAL_ONLY',  '')
ON CONFLICT ("id") DO NOTHING;

-- Seed the reference template. isBuiltIn — the UI should offer "duplicate and edit"
-- rather than mutating it.
INSERT INTO "AnalysisTemplate" ("id", "name", "description", "format", "deckSize", "isBuiltIn", "createdAt", "updatedAt") VALUES
  ('commander-baseline', 'Commander Baseline',
   'A general-purpose ratio for 100-card Commander decks. Targets overlap — a single card can satisfy several roles, so the targets sum past 99 on purpose.',
   'commander', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "TemplateRequirement" ("id", "templateId", "roleId", "targetCount", "minCount", "maxCount", "sortOrder", "note") VALUES
  ('cb-land',      'commander-baseline', 'land',                38, 36,   40,   0, 'Counts quantity, so basics count once per copy'),
  ('cb-ramp',      'commander-baseline', 'ramp',                10, NULL, NULL, 1, NULL),
  ('cb-advantage', 'commander-baseline', 'card-advantage',      12, NULL, NULL, 2, NULL),
  ('cb-targeted',  'commander-baseline', 'targeted-disruption', 12, NULL, NULL, 3, NULL),
  ('cb-mass',      'commander-baseline', 'mass-disruption',      6, NULL, NULL, 4, NULL),
  ('cb-identity',  'commander-baseline', 'identity',            30, NULL, NULL, 5, 'Assigned by hand — no automatic classification is possible')
ON CONFLICT ("id") DO NOTHING;
