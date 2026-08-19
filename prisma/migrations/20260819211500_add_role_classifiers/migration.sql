-- Card Advantage and Targeted Disruption had no classifier, only a CardTheme tag
-- and one oracle regex. The tags cover ~70 cards of the ~31k corpus, so in practice
-- both roles were matched by regex alone:
--
--   card-advantage:      'draw (a|two|three|four|[0-9x]+) cards?'
--   targeted-disruption: '(destroy|exile) target|counter target (spell|ability)'
--
-- Both are replaced by classifiers in src/lib/commander.ts, which read face text
-- for double-faced cards, ignore keyword reminder text, and draw the distinctions
-- the regexes could not: "draws" (an opponent) vs "draw" (you), looting vs real
-- card advantage, graveyard hate vs removal.
DELETE FROM "RoleMatcher" WHERE "id" IN ('m-adv-regex', 'm-targeted-regex');

INSERT INTO "RoleMatcher" ("id", "roleId", "kind", "value") VALUES
  ('m-adv-classifier',      'card-advantage',      'CLASSIFIER', 'isCardAdvantage'),
  ('m-targeted-classifier', 'targeted-disruption', 'CLASSIFIER', 'isTargetedDisruption')
ON CONFLICT ("id") DO NOTHING;
