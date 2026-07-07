INSERT INTO regulatory.tax_rules (id, country_code, tax_name, rate_bps, is_inclusive, effective_from)
VALUES ('55c3bd8f-0153-4bf0-b1aa-ccbb88ee9f11', 'KE', 'VAT', 1600, false, now())
ON CONFLICT DO NOTHING;
