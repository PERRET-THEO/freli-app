-- Secure contract_templates RLS and contracts storage bucket

ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS contract_template_id UUID REFERENCES contract_templates(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Public read templates" ON contract_templates;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Portal read linked templates' AND tablename = 'contract_templates'
  ) THEN
    CREATE POLICY "Portal read linked templates"
    ON contract_templates FOR SELECT
    TO anon, authenticated
    USING (
      agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid())
      OR id IN (
        SELECT contract_template_id FROM checklist_items
        WHERE contract_template_id IS NOT NULL
      )
      OR (
        is_default = true
        AND agency_id IN (SELECT DISTINCT agency_id FROM projects WHERE agency_id IS NOT NULL)
      )
    );
  END IF;
END $$;

UPDATE storage.buckets SET public = false WHERE id = 'contracts';

DROP POLICY IF EXISTS "Public read contracts" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload contracts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload contracts" ON storage.objects;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Agency read own contract files' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Agency read own contract files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'contracts'
      AND (storage.foldername(name))[1] = 'templates'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM agencies WHERE user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Agency upload own templates' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Agency upload own templates"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'contracts'
      AND (storage.foldername(name))[1] = 'templates'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM agencies WHERE user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Agency update own contract files' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Agency update own contract files"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'contracts'
      AND (storage.foldername(name))[1] = 'templates'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM agencies WHERE user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Agency delete own contract files' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Agency delete own contract files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'contracts'
      AND (storage.foldername(name))[1] = 'templates'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM agencies WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;
