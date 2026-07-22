-- Lecture des PDF générés par l'IA (préfixe generated/{agency_id}/)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Agency read own generated contracts' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Agency read own generated contracts"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'contracts'
      AND (storage.foldername(name))[1] = 'generated'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM agencies WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;
