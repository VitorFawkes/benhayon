-- Add per-patient AI toggle
ALTER TABLE patients ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT true;
