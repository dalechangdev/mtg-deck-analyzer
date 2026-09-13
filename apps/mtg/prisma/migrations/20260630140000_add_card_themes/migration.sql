-- CreateTable
CREATE TABLE "CardTheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "CardTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CardToCardTheme" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CardTheme_name_key" ON "CardTheme"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_CardToCardTheme_AB_unique" ON "_CardToCardTheme"("A", "B");

-- CreateIndex
CREATE INDEX "_CardToCardTheme_B_index" ON "_CardToCardTheme"("B");

-- AddForeignKey
ALTER TABLE "_CardToCardTheme" ADD CONSTRAINT "_CardToCardTheme_A_fkey" FOREIGN KEY ("A") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CardToCardTheme" ADD CONSTRAINT "_CardToCardTheme_B_fkey" FOREIGN KEY ("B") REFERENCES "CardTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed card themes — ordered by prevalence in the library and decks
INSERT INTO "CardTheme" ("id", "name", "description") VALUES
  -- Core mechanics heavily represented in the library/deck
  ('sacrifice',          'Sacrifice',          'Sacrifice outlets and payoffs — enables or benefits from sacrificing permanents'),
  ('death-trigger',      'Death Trigger',      'Triggers or gains value when creatures die'),
  ('token-generation',   'Token Generation',   'Creates creature tokens'),
  ('token-synergy',      'Token Synergy',      'Cares about or buffs creature tokens you control'),
  ('aristocrats',        'Aristocrats',        'Drains life or generates value on creature death (sacrifice + drain/gain loop)'),
  ('life-gain',          'Life Gain',          'Gains life for you'),
  ('life-drain',         'Life Drain',         'Causes opponents to lose life, often paired with life gain'),
  ('graveyard-recursion','Graveyard Recursion','Returns cards or permanents from the graveyard'),
  ('plus-counters',      '+1/+1 Counters',     '+1/+1 counter synergy — generates, moves, or benefits from +1/+1 counters'),
  ('minus-counters',     '-1/-1 Counters',     '-1/-1 counter synergy'),
  ('proliferate',        'Proliferate',        'Proliferate effects — adds extra counters to permanents and players'),
  ('card-draw',          'Card Draw',          'Draws cards or replaces itself with additional cards'),
  ('mana-ramp',          'Mana Ramp',          'Accelerates mana production beyond the normal one-land-per-turn curve'),
  ('removal',            'Removal',            'Single-target removal — destroys or exiles a permanent'),
  ('board-wipe',         'Board Wipe',         'Mass removal — destroys or exiles multiple permanents at once'),
  ('counterspell',       'Counterspell',       'Counters spells on the stack'),
  ('tutor',              'Tutor',              'Searches the library for a specific card'),
  ('landfall',           'Landfall',           'Triggers whenever a land enters the battlefield under your control'),
  ('land-matters',       'Land Matters',       'Specifically cares about lands — sacrifice, fetch, or interact with lands'),
  ('mill',               'Mill',               'Mills cards from a library into the graveyard'),
  ('discard',            'Discard',            'Forces opponents to discard cards or rewards discarding your own cards'),
  ('copy-clone',         'Copy / Clone',       'Copies or clones permanents or spells'),
  ('blink-flicker',      'Blink / Flicker',    'Flickers (exiles and returns) or bounces permanents to reuse ETBs'),
  ('evasion',            'Evasion',            'Flying, trample, menace, or another form of combat evasion'),
  ('protection',         'Protection',         'Hexproof, indestructible, ward, or similar protective abilities'),
  ('equipment',          'Equipment',          'Equipment card or equipment synergy'),
  ('enchantment',        'Enchantment',        'Enchantment or aura card'),
  ('treasure',           'Treasure',           'Creates or benefits from Treasure tokens'),
  ('food',               'Food',               'Creates or benefits from Food tokens'),

  -- Tribal themes represented in the library and deck
  ('vampire',            'Vampire',            'Vampire tribal — cares about or is a Vampire'),
  ('elf',                'Elf',                'Elf tribal — cares about or is an Elf'),
  ('zombie',             'Zombie',             'Zombie tribal — cares about or is a Zombie'),
  ('pest',               'Pest',               'Pest token synergy — creates, buffs, or benefits from Pest tokens'),
  ('eldrazi',            'Eldrazi',            'Eldrazi synergy — Eldrazi cards or Eldrazi Spawn / Scion token producers'),
  ('snake',              'Snake',              'Snake tribal — cares about or is a Snake'),
  ('dragon',             'Dragon',             'Dragon tribal — cares about or is a Dragon'),
  ('angel',              'Angel',              'Angel tribal — cares about or is an Angel'),
  ('goblin',             'Goblin',             'Goblin tribal — cares about or is a Goblin'),
  ('knight',             'Knight',             'Knight tribal — cares about or is a Knight'),
  ('spirit',             'Spirit',             'Spirit tribal — cares about or is a Spirit'),
  ('faerie',             'Faerie',             'Faerie tribal — cares about or is a Faerie');
