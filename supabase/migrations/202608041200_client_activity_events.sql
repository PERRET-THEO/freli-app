-- Chronologie d'activité client (append-only) pour événements futurs.
-- La fiche client lit aussi une union des tables existantes (relances, checklist, extractions).

CREATE TABLE IF NOT EXISTS client_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_activity_events_client_occurred
  ON client_activity_events (client_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_activity_events_agency
  ON client_activity_events (agency_id, occurred_at DESC);

ALTER TABLE client_activity_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE policyname = 'Agency manages own client activity events'
      AND tablename = 'client_activity_events'
  ) THEN
    CREATE POLICY "Agency manages own client activity events"
    ON client_activity_events FOR ALL
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));
  END IF;
END
$$;
