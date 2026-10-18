-- PR A migration 2 (coupante) : DROP policies anon larges + bucket documents privé.
-- À appliquer APRÈS déploiement front (RPC + signed URLs).

-- 1) DROP policies anon projects / checklist_items
DROP POLICY IF EXISTS "Portal reads projects by token" ON public.projects;
DROP POLICY IF EXISTS "Portal updates project status" ON public.projects;
DROP POLICY IF EXISTS "Portal reads checklist items" ON public.checklist_items;
DROP POLICY IF EXISTS "Portal updates checklist items" ON public.checklist_items;
DROP POLICY IF EXISTS "Public read checklist" ON public.checklist_items;
DROP POLICY IF EXISTS "Public write checklist" ON public.checklist_items;

-- 2) contract_templates : retirer l'accès anon (lecture portail via portal-contract)
DROP POLICY IF EXISTS "Portal read linked templates" ON public.contract_templates;
-- Les policies authenticated « Agency manages own templates » restent en place.

-- 3) Storage documents : privé + MIME/size
UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/zip'
  ]::text[]
WHERE id = 'documents';

DROP POLICY IF EXISTS "Public read documents" ON storage.objects;
DROP POLICY IF EXISTS "Public upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Public update documents" ON storage.objects;

DROP POLICY IF EXISTS "Agency read project documents" ON storage.objects;
CREATE POLICY "Agency read project documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.projects
        WHERE agency_id IN (SELECT public.user_agency_ids())
      )
      OR (storage.foldername(name))[1] IN (
        SELECT token FROM public.projects
        WHERE agency_id IN (SELECT public.user_agency_ids())
          AND token IS NOT NULL
      )
    )
  );

-- 4) Leftovers contracts public write
DROP POLICY IF EXISTS "Public upload contracts" ON storage.objects;
DROP POLICY IF EXISTS "Public update contracts" ON storage.objects;

-- 5) Logos : DROP public INSERT/UPDATE, garder lecture publique
DROP POLICY IF EXISTS "Public upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Public update logos" ON storage.objects;
