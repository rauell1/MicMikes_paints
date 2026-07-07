INSERT INTO vendor.vendors (id, vendor_type, legal_name, display_name, slug, status, country_code, verification_level)
VALUES ('99b7ad4f-4d32-473d-88b0-51a8cc3f5ba0', 'first_party', 'MicMikes Paints Ltd', 'MicMikes Paints', 'micmikes-paints', 'verified', 'KE', 'enhanced')
ON CONFLICT DO NOTHING;
