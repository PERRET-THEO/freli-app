-- Statut generating pour brouillon de relance async + 1 seul generating / projet.

ALTER TABLE public.smart_reminders
  DROP CONSTRAINT IF EXISTS smart_reminders_status_check;

ALTER TABLE public.smart_reminders
  ADD CONSTRAINT smart_reminders_status_check
  CHECK (status IN ('draft', 'sent', 'dismissed', 'stale', 'generating'));

CREATE UNIQUE INDEX IF NOT EXISTS smart_reminders_one_generating_per_project
  ON public.smart_reminders (project_id)
  WHERE status = 'generating';
