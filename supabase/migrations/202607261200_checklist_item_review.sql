-- Revue agence des éléments transmis par le client (valider / demander une correction).
-- Un item rejeté repasse à completed = false : il se réouvre dans le portail avec le motif.

ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checklist_items_review_status_check'
  ) THEN
    ALTER TABLE checklist_items
      ADD CONSTRAINT checklist_items_review_status_check
      CHECK (review_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Les items déjà complétés avant cette migration sont considérés comme acceptés :
-- sinon ils apparaîtraient tous comme « à valider » dans le tableau de bord.
UPDATE checklist_items
SET review_status = 'approved',
    reviewed_at = COALESCE(reviewed_at, now())
WHERE completed = true
  AND review_status = 'pending';

CREATE INDEX IF NOT EXISTS checklist_items_review_status_idx
  ON checklist_items (project_id, review_status);
