-- Seed sacrifice role tags into CardTheme
INSERT INTO "CardTheme" ("id", "name", "description") VALUES
  ('sacrifice-outlet',  'Sacrifice Outlet',  'Can sacrifice other permanents as a cost or activated ability'),
  ('sacrifice-payoff',  'Sacrifice Payoff',  'Gains value when permanents are sacrificed or creatures die')
ON CONFLICT ("id") DO NOTHING;
