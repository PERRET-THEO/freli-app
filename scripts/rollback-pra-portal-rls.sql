-- EMERGENCY ONLY — restaure l'état pré-migration 2 (policies anon larges).
-- Ne pas exécuter en prod sans revert front concomitant.

-- Recréer policies anon projects
DROP POLICY IF EXISTS "Portal reads projects by token" ON public.projects;
CREATE POLICY "Portal reads projects by token"
  ON public.projects FOR SELECT TO anon
  USING (token IS NOT NULL AND length(token) >= 16);

DROP POLICY IF EXISTS "Portal updates project status" ON public.projects;
CREATE POLICY "Portal updates project status"
  ON public.projects FOR UPDATE TO anon
  USING (token IS NOT NULL AND length(token) >= 16)
  WITH CHECK (token IS NOT NULL AND length(token) >= 16);

DROP POLICY IF EXISTS "Portal reads checklist items" ON public.checklist_items;
CREATE POLICY "Portal reads checklist items"
  ON public.checklist_items FOR SELECT TO anon
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE token IS NOT NULL AND length(token) >= 16
    )
  );

DROP POLICY IF EXISTS "Portal updates checklist items" ON public.checklist_items;
CREATE POLICY "Portal updates checklist items"
  ON public.checklist_items FOR UPDATE TO anon
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE token IS NOT NULL AND length(token) >= 16
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE token IS NOT NULL AND length(token) >= 16
    )
  );

-- documents public (dangereux — rollback emergency)
UPDATE storage.buckets SET public = true WHERE id = 'documents';
DROP POLICY IF EXISTS "Public read documents" ON storage.objects;
CREATE POLICY "Public read documents"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'documents');
DROP POLICY IF EXISTS "Public upload documents" ON storage.objects;
CREATE POLICY "Public upload documents"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'documents');
DROP POLICY IF EXISTS "Public update documents" ON storage.objects;
CREATE POLICY "Public update documents"
  ON storage.objects FOR UPDATE TO public
  USING (bucket_id = 'documents');
