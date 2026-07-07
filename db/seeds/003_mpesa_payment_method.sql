INSERT INTO payment.payment_methods (id, code, provider, country_code, currency_code, display_name, fee_type, fee_bps)
VALUES ('77e1bd6f-0043-4422-90bf-fb488f28fa99', 'MPESA_STK', 'mpesa', 'KE', 'KES', 'M-Pesa', 'percent', 150)
ON CONFLICT DO NOTHING;
