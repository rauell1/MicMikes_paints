-- 006_mpesa_provider_request_unique.sql
-- Required by the STK push handler's `ON CONFLICT (provider_request_id)` upsert.
-- Without a unique index on this column Postgres raises 42P10 and every STK
-- push initiation errors out after the customer's PIN prompt is already sent.
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_provider_request_id_key
  ON payment.payment_attempts (provider_request_id);
