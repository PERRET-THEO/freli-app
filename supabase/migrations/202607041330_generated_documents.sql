-- Fonctionnalité IA 3 : génération de contrats/propositions depuis un brief

-- Modèles de référence de l'agence (1 à 3 documents pour apprendre style et structure)
CREATE TABLE IF NOT EXISTS agency_document_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  -- Résumé structuré extrait par Claude à l'upload (sections, ton, clauses types) :
  -- évite de renvoyer le document complet à chaque génération
  structure_summary JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_document_models_agency
  ON agency_document_models(agency_id, created_at DESC);

-- Documents générés : versionning simple (version IA immuable vs version éditée)
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  brief TEXT NOT NULL,
  ai_version JSONB NOT NULL,
  current_version JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  contract_template_id UUID REFERENCES contract_templates(id) ON DELETE SET NULL,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  finalized_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_project
  ON generated_documents(project_id, created_at DESC);

ALTER TABLE agency_document_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency manages own document models' AND tablename = 'agency_document_models'
  ) THEN
    CREATE POLICY "Agency manages own document models"
    ON agency_document_models FOR ALL
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()))
    WITH CHECK (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency reads own generated documents' AND tablename = 'generated_documents'
  ) THEN
    CREATE POLICY "Agency reads own generated documents"
    ON generated_documents FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;

  -- L'agence édite le current_version d'un brouillon ; la création (génération IA)
  -- et la finalisation (rendu PDF) passent par les Edge Functions (service role).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency updates own generated documents' AND tablename = 'generated_documents'
  ) THEN
    CREATE POLICY "Agency updates own generated documents"
    ON generated_documents FOR UPDATE
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()))
    WITH CHECK (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency deletes own generated documents' AND tablename = 'generated_documents'
  ) THEN
    CREATE POLICY "Agency deletes own generated documents"
    ON generated_documents FOR DELETE
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Storage : le bucket `contracts` n'autorise que le préfixe templates/ pour les
-- agences ; on ouvre le préfixe models/{agency_id}/ pour les modèles de référence.
-- (Le préfixe generated/ est écrit uniquement par le service role — pas de policy.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Agency read own reference models' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Agency read own reference models"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'contracts'
      AND (storage.foldername(name))[1] = 'models'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM agencies WHERE user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Agency upload own reference models' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Agency upload own reference models"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'contracts'
      AND (storage.foldername(name))[1] = 'models'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM agencies WHERE user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Agency delete own reference models' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Agency delete own reference models"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'contracts'
      AND (storage.foldername(name))[1] = 'models'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM agencies WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;
