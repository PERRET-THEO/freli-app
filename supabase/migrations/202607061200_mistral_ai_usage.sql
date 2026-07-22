-- Logging consommation tokens IA + colonnes pipeline OCR (extraction documents)

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  feature TEXT NOT NULL CHECK (feature IN ('extraction', 'reminders', 'contracts')),
  operation TEXT NOT NULL CHECK (operation IN ('ocr', 'chat', 'vision')),
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_agency_created
  ON ai_usage_logs(agency_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature_created
  ON ai_usage_logs(feature, created_at DESC);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency reads own ai usage logs' AND tablename = 'ai_usage_logs'
  ) THEN
    CREATE POLICY "Agency reads own ai usage logs"
    ON ai_usage_logs FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Pipeline OCR pour l'extraction documentaire (F1) — si la table existe déjà
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'extracted_document_data'
  ) THEN
    ALTER TABLE extracted_document_data
      ADD COLUMN IF NOT EXISTS ocr_markdown TEXT,
      ADD COLUMN IF NOT EXISTS ocr_pages JSONB,
      ADD COLUMN IF NOT EXISTS extraction_pipeline TEXT DEFAULT 'ocr_chat';

    ALTER TABLE extracted_document_data
      DROP CONSTRAINT IF EXISTS extracted_document_data_extraction_pipeline_check;
    ALTER TABLE extracted_document_data
      ADD CONSTRAINT extracted_document_data_extraction_pipeline_check
      CHECK (extraction_pipeline IN ('ocr_chat', 'pixtral_fallback'));
  END IF;
END $$;
