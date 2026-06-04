CREATE TABLE IF NOT EXISTS project_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  recipient_email TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_reminder_logs_project_sent
  ON project_reminder_logs(project_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_reminder_logs_agency_sent
  ON project_reminder_logs(agency_id, sent_at DESC);

ALTER TABLE project_reminder_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency reads own reminder logs' AND tablename = 'project_reminder_logs'
  ) THEN
    CREATE POLICY "Agency reads own reminder logs"
    ON project_reminder_logs FOR SELECT
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;
END
$$;
