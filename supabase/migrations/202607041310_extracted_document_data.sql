-- Fonctionnalité IA 1 : extraction de données depuis les documents uploadés

-- Coordonnées bancaires sur la fiche client (cible du pré-remplissage RIB)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS bic TEXT;

CREATE TABLE IF NOT EXISTS extracted_document_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES checklist_items(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (document_type IN ('identity', 'kbis', 'rib', 'unknown')),
  extracted_fields JSONB,
  reviewed_fields JSONB,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'pending_review', 'validated', 'rejected', 'failed')),
  error_message TEXT,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_extracted_document_data_project
  ON extracted_document_data(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extracted_document_data_agency_status
  ON extracted_document_data(agency_id, status);

-- Audit : validations, rejets et corrections manuelles champ par champ
-- (permet de mesurer la fiabilité de l'extraction dans le temps)
CREATE TABLE IF NOT EXISTS extraction_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES extracted_document_data(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('validated', 'rejected', 'field_corrected')),
  field_name TEXT,
  ai_value TEXT,
  corrected_value TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extraction_audit_logs_extraction
  ON extraction_audit_logs(extraction_id, created_at DESC);

ALTER TABLE extracted_document_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- L'agence lit et met à jour ses extractions ; l'insertion se fait via
  -- service role (Edge Function déclenchée par le portail client).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency reads own extractions' AND tablename = 'extracted_document_data'
  ) THEN
    CREATE POLICY "Agency reads own extractions"
    ON extracted_document_data FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency updates own extractions' AND tablename = 'extracted_document_data'
  ) THEN
    CREATE POLICY "Agency updates own extractions"
    ON extracted_document_data FOR UPDATE
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()))
    WITH CHECK (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency reads own extraction audit logs' AND tablename = 'extraction_audit_logs'
  ) THEN
    CREATE POLICY "Agency reads own extraction audit logs"
    ON extraction_audit_logs FOR SELECT
    TO authenticated
    USING (
      extraction_id IN (
        SELECT id FROM extracted_document_data
        WHERE agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid())
      )
    );
  END IF;
END $$;
