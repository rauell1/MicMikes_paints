INSERT INTO delivery.delivery_zones (id, country_code, county_code, zone_name, base_fee_minor, free_delivery_threshold_minor, estimated_days_min, estimated_days_max)
VALUES ('66f2bd7f-94d3-488f-a0bb-26aa77dd8e10', 'KE', 'NBI', 'Nairobi Metro', 0, 0, 1, 2)
ON CONFLICT DO NOTHING;
