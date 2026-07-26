-- Configuration par étape : options de choix, URL de prise de rendez-vous.
-- `type` reste un TEXT libre (pas de CHECK) pour rester compatible avec les
-- projets existants ; les types acceptés sont validés côté application.

ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS config JSONB;

ALTER TABLE checklist_template_items
  ADD COLUMN IF NOT EXISTS config JSONB;
