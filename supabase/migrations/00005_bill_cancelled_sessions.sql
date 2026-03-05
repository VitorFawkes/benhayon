-- Add configurable option to bill cancelled sessions (no-show policy)
ALTER TABLE ai_settings
  ADD COLUMN IF NOT EXISTS bill_cancelled_sessions BOOLEAN NOT NULL DEFAULT true;

-- Ensure idempotent invoice generation (prevent race condition duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_month
  ON invoices (profile_id, patient_id, reference_month);
