ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS auto_reminders_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_reminders_delay_hours INTEGER DEFAULT 48;

ALTER TABLE agencies
  DROP CONSTRAINT IF EXISTS agencies_auto_reminders_delay_hours_check;

ALTER TABLE agencies
  ADD CONSTRAINT agencies_auto_reminders_delay_hours_check
  CHECK (auto_reminders_delay_hours IS NULL OR auto_reminders_delay_hours >= 12);
