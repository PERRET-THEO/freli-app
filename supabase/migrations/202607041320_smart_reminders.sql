-- Fonctionnalité IA 2 : relances intelligentes basées sur le comportement client

-- Signal "visite portail" : plus fiable que le tracking de clic email
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS last_portal_visit_at TIMESTAMPTZ;

-- Événements email Resend (sent = à l'envoi ; opened/clicked = webhooks Resend)
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  resend_email_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'opened', 'clicked')),
  occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_project_type
  ON email_events(project_id, event_type);

CREATE INDEX IF NOT EXISTS idx_email_events_resend_id
  ON email_events(resend_email_id);

-- Relances générées par l'IA : contenu + comportement détecté + résultat
CREATE TABLE IF NOT EXISTS smart_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  behavior_category TEXT NOT NULL
    CHECK (behavior_category IN ('not_opened', 'opened_not_clicked', 'stuck_on_step')),
  blocking_step_label TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'professional',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'dismissed')),
  sent_at TIMESTAMPTZ,
  resend_email_id TEXT,
  resulted_in_action BOOLEAN,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_reminders_project
  ON smart_reminders(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_smart_reminders_agency_status
  ON smart_reminders(agency_id, status);

-- Réglages agence : ton de marque, mode brouillon vs auto, plafond anti-harcèlement
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS ai_reminder_tone TEXT DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS ai_reminder_auto_send BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_reminder_max_per_project INTEGER DEFAULT 3;

ALTER TABLE agencies
  DROP CONSTRAINT IF EXISTS agencies_ai_reminder_tone_check;
ALTER TABLE agencies
  ADD CONSTRAINT agencies_ai_reminder_tone_check
  CHECK (ai_reminder_tone IN ('professional', 'warm', 'direct'));

ALTER TABLE agencies
  DROP CONSTRAINT IF EXISTS agencies_ai_reminder_max_check;
ALTER TABLE agencies
  ADD CONSTRAINT agencies_ai_reminder_max_check
  CHECK (ai_reminder_max_per_project IS NULL OR ai_reminder_max_per_project BETWEEN 1 AND 10);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_reminders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- email_events : écriture uniquement via service role (Edge Functions)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency reads own email events' AND tablename = 'email_events'
  ) THEN
    CREATE POLICY "Agency reads own email events"
    ON email_events FOR SELECT
    TO authenticated
    USING (
      project_id IN (
        SELECT id FROM projects
        WHERE agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid())
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency reads own smart reminders' AND tablename = 'smart_reminders'
  ) THEN
    CREATE POLICY "Agency reads own smart reminders"
    ON smart_reminders FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;

  -- L'agence peut éditer/ignorer un brouillon (l'envoi passe par l'Edge Function)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency updates own smart reminders' AND tablename = 'smart_reminders'
  ) THEN
    CREATE POLICY "Agency updates own smart reminders"
    ON smart_reminders FOR UPDATE
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()))
    WITH CHECK (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;
END $$;
