-- CreateTable
CREATE TABLE "DeckTheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "DeckTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DeckToDeckTheme" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DeckTheme_name_key" ON "DeckTheme"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_DeckToDeckTheme_AB_unique" ON "_DeckToDeckTheme"("A", "B");

-- CreateIndex
CREATE INDEX "_DeckToDeckTheme_B_index" ON "_DeckToDeckTheme"("B");

-- AddForeignKey
ALTER TABLE "_DeckToDeckTheme" ADD CONSTRAINT "_DeckToDeckTheme_A_fkey" FOREIGN KEY ("A") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeckToDeckTheme" ADD CONSTRAINT "_DeckToDeckTheme_B_fkey" FOREIGN KEY ("B") REFERENCES "DeckTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Deck" DROP COLUMN "themes";

-- Seed deck themes
INSERT INTO "DeckTheme" ("id", "name") VALUES
  ('aggro',        'Aggro'),
  ('control',      'Control'),
  ('combo',        'Combo'),
  ('midrange',     'Midrange'),
  ('tempo',        'Tempo'),
  ('stax',         'Stax'),
  ('ramp',         'Ramp'),
  ('spellslinger', 'Spellslinger'),
  ('tokens',       'Tokens'),
  ('aristocrats',  'Aristocrats'),
  ('reanimator',   'Reanimator'),
  ('graveyard',    'Graveyard'),
  ('storm',        'Storm'),
  ('infect',       'Infect'),
  ('voltron',      'Voltron'),
  ('pillowfort',   'Pillowfort'),
  ('tribal',       'Tribal'),
  ('enchantress',  'Enchantress'),
  ('artifacts',    'Artifacts'),
  ('equipment',    'Equipment'),
  ('lands',        'Lands'),
  ('mill',         'Mill'),
  ('chaos',        'Chaos'),
  ('group-hug',    'Group Hug'),
  ('flash',        'Flash'),
  ('blink',        'Blink / Flicker'),
  ('sacrifice',    'Sacrifice'),
  ('card-draw',    'Card Draw'),
  ('lifegain',     'Life Gain'),
  ('lifedrain',    'Life Drain'),
  ('plus-counters', '+1/+1 Counters'),
  ('minus-counters', '-1/-1 Counters'),
  ('copy',         'Copy / Clone'),
  ('superfriends', 'Superfriends'),
  ('politics',     'Politics');
