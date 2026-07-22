-- Activation individuelle des 3 modules IA par agence
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS ai_extraction_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_reminders_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_contracts_enabled BOOLEAN DEFAULT false;
