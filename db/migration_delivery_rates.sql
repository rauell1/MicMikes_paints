-- Run this once in your Neon DB console
CREATE TABLE IF NOT EXISTS delivery_rates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county     TEXT NOT NULL,
  town       TEXT,          -- NULL means "all towns in this county"
  rate_kes   INTEGER NOT NULL DEFAULT 0,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one rate per county+town combo (town NULL = county-wide default)
CREATE UNIQUE INDEX IF NOT EXISTS delivery_rates_county_town_uidx
  ON delivery_rates (LOWER(county), LOWER(COALESCE(town, '')));

-- Example seed data (delete or update to your own rates)
INSERT INTO delivery_rates (county, town, rate_kes, notes) VALUES
  ('Nairobi',  NULL,        500,  'Nairobi County default'),
  ('Nairobi',  'Westlands', 300,  'CBD/Westlands area'),
  ('Kiambu',   NULL,        600,  'Kiambu County default'),
  ('Kiambu',   'Ruiru',     450,  'Ruiru town'),
  ('Kiambu',   'Thika',     500,  'Thika town'),
  ('Mombasa',  NULL,        900,  'Mombasa County'),
  ('Nakuru',   NULL,        1200, 'Nakuru County'),
  ('Kisumu',   NULL,        1400, 'Kisumu County')
ON CONFLICT DO NOTHING;
