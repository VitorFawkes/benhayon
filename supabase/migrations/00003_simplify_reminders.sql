-- Simplify reminders: single reminder with optional repeat instead of 3-level escalation
ALTER TABLE ai_settings
  ADD COLUMN IF NOT EXISTS reminder_day INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS reminder_repeat_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_repeat_interval_days INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS reminder_max_count INT NOT NULL DEFAULT 3;
