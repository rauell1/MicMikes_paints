INSERT INTO catalog.finishes (id, code, name, sheen_level, is_active) VALUES
  ('00f1bd7f-1111-4444-a0bb-26aa77dd8e10', 'MATTE', 'Matte', 1, true),
  ('00f1bd7f-2222-4444-a0bb-26aa77dd8e10', 'EGGSHELL', 'Eggshell', 2, true),
  ('00f1bd7f-3333-4444-a0bb-26aa77dd8e10', 'SATIN', 'Satin', 3, true),
  ('00f1bd7f-4444-4444-a0bb-26aa77dd8e10', 'SEMIGLOSS', 'Semi-Gloss', 4, true),
  ('00f1bd7f-5555-4444-a0bb-26aa77dd8e10', 'GLOSS', 'Gloss', 5, true)
ON CONFLICT DO NOTHING;
