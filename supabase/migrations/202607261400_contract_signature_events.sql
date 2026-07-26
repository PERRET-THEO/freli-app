-- Faisceau de preuves d'une signature électronique simple : qui a signé, quand,
-- depuis quel appareil, et empreinte du document signé (intégrité).

CREATE TABLE IF NOT EXISTS contract_signature_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES checklist_items(id) ON DELETE SET NULL,
  signer_name TEXT,
  signer_email TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  /* SHA-256 du PDF signé : permet de prouver qu'il n'a pas été modifié après coup. */
  document_sha256 TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_signature_events_project_idx
  ON contract_signature_events (project_id, signed_at DESC);

ALTER TABLE contract_signature_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- L'insertion se fait via edge function (service role) : aucune policy anon
  -- en écriture, pour qu'un client ne puisse pas fabriquer de preuve.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Agency reads own signature events'
      AND tablename = 'contract_signature_events'
  ) THEN
    CREATE POLICY "Agency reads own signature events"
    ON contract_signature_events FOR SELECT
    TO authenticated
    USING (
      project_id IN (
        SELECT id FROM projects
        WHERE agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid())
      )
    );
  END IF;
END $$;
