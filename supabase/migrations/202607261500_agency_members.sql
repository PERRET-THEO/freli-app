-- Sièges équipe : plusieurs utilisateurs partagent une agence (owner / member).
-- agencies.user_id reste le propriétaire canonique (facturation, intégrations Stripe/Drive).

CREATE TABLE IF NOT EXISTS agency_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_members_role_check CHECK (role IN ('owner', 'member')),
  CONSTRAINT agency_members_unique UNIQUE (agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS agency_members_user_idx ON agency_members (user_id);
CREATE INDEX IF NOT EXISTS agency_members_agency_idx ON agency_members (agency_id);

-- Seed : chaque propriétaire d'agence devient membre owner.
INSERT INTO agency_members (agency_id, user_id, role)
SELECT id, user_id, 'owner'
FROM agencies
ON CONFLICT (agency_id, user_id) DO NOTHING;

-- Toute nouvelle agence crée automatiquement le siège owner.
CREATE OR REPLACE FUNCTION public.ensure_agency_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO agency_members (agency_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (agency_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agencies_ensure_owner_membership ON agencies;
CREATE TRIGGER agencies_ensure_owner_membership
AFTER INSERT ON agencies
FOR EACH ROW
EXECUTE FUNCTION public.ensure_agency_owner_membership();

ALTER TABLE agency_members ENABLE ROW LEVEL SECURITY;

-- Fonction SECURITY DEFINER pour éviter les récursions RLS.
CREATE OR REPLACE FUNCTION public.user_agency_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT agency_id FROM agency_members WHERE user_id = auth.uid()
  UNION
  SELECT id FROM agencies WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.user_agency_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_agency_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_agency_ids() TO service_role;

CREATE OR REPLACE FUNCTION public.is_agency_owner(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agency_members
    WHERE agency_id = target_agency_id
      AND user_id = auth.uid()
      AND role = 'owner'
  )
  OR EXISTS (
    SELECT 1 FROM agencies
    WHERE id = target_agency_id
      AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_agency_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_agency_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agency_owner(uuid) TO service_role;

DO $$
BEGIN
  -- agency_members policies
  DROP POLICY IF EXISTS "Members read agency roster" ON agency_members;
  CREATE POLICY "Members read agency roster"
  ON agency_members FOR SELECT
  TO authenticated
  USING (agency_id IN (SELECT public.user_agency_ids()));

  DROP POLICY IF EXISTS "Owners manage agency roster" ON agency_members;
  CREATE POLICY "Owners manage agency roster"
  ON agency_members FOR ALL
  TO authenticated
  USING (public.is_agency_owner(agency_id))
  WITH CHECK (public.is_agency_owner(agency_id));

  -- agencies : lecture / maj pour tous les membres ; création réservée au user_id
  DROP POLICY IF EXISTS "Users manage own agency" ON agencies;
  DROP POLICY IF EXISTS "Members read agency" ON agencies;
  DROP POLICY IF EXISTS "Members update agency" ON agencies;
  DROP POLICY IF EXISTS "Users create own agency" ON agencies;
  DROP POLICY IF EXISTS "Owners delete agency" ON agencies;

  CREATE POLICY "Members read agency"
  ON agencies FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.user_agency_ids()));

  CREATE POLICY "Members update agency"
  ON agencies FOR UPDATE
  TO authenticated
  USING (id IN (SELECT public.user_agency_ids()))
  WITH CHECK (id IN (SELECT public.user_agency_ids()));

  CREATE POLICY "Users create own agency"
  ON agencies FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

  CREATE POLICY "Owners delete agency"
  ON agencies FOR DELETE
  TO authenticated
  USING (public.is_agency_owner(id));

  -- projects
  DROP POLICY IF EXISTS "Agency manages own projects" ON projects;
  CREATE POLICY "Agency manages own projects"
  ON projects FOR ALL
  TO authenticated
  USING (agency_id IN (SELECT public.user_agency_ids()))
  WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));

  -- checklist_items
  DROP POLICY IF EXISTS "Agency manages own checklist items" ON checklist_items;
  CREATE POLICY "Agency manages own checklist items"
  ON checklist_items FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects WHERE agency_id IN (SELECT public.user_agency_ids())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE agency_id IN (SELECT public.user_agency_ids())
    )
  );

  -- clients
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients') THEN
    DROP POLICY IF EXISTS "Agency manages own clients" ON clients;
    CREATE POLICY "Agency manages own clients"
    ON clients FOR ALL
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));
  END IF;

  -- checklist_templates
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'checklist_templates') THEN
    DROP POLICY IF EXISTS "Agency manages own checklist templates" ON checklist_templates;
    CREATE POLICY "Agency manages own checklist templates"
    ON checklist_templates FOR ALL
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'checklist_template_items') THEN
    DROP POLICY IF EXISTS "Agency manages own checklist template items" ON checklist_template_items;
    CREATE POLICY "Agency manages own checklist template items"
    ON checklist_template_items FOR ALL
    TO authenticated
    USING (
      template_id IN (
        SELECT id FROM checklist_templates
        WHERE agency_id IN (SELECT public.user_agency_ids())
      )
    )
    WITH CHECK (
      template_id IN (
        SELECT id FROM checklist_templates
        WHERE agency_id IN (SELECT public.user_agency_ids())
      )
    );
  END IF;

  -- contract_templates (garder la policy portail séparée)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'contract_templates') THEN
    DROP POLICY IF EXISTS "Agency manages own templates" ON contract_templates;
    CREATE POLICY "Agency manages own templates"
    ON contract_templates FOR ALL
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));
  END IF;

  -- project_reminder_logs
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_reminder_logs') THEN
    DROP POLICY IF EXISTS "Agency reads own reminder logs" ON project_reminder_logs;
    CREATE POLICY "Agency reads own reminder logs"
    ON project_reminder_logs FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()));
  END IF;

  -- project_drive_files
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_drive_files') THEN
    DROP POLICY IF EXISTS "Agency reads own drive files" ON project_drive_files;
    CREATE POLICY "Agency reads own drive files"
    ON project_drive_files FOR SELECT
    TO authenticated
    USING (
      project_id IN (
        SELECT id FROM projects WHERE agency_id IN (SELECT public.user_agency_ids())
      )
    );
  END IF;

  -- extracted_document_data
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'extracted_document_data') THEN
    DROP POLICY IF EXISTS "Agency reads own extractions" ON extracted_document_data;
    DROP POLICY IF EXISTS "Agency updates own extractions" ON extracted_document_data;
    CREATE POLICY "Agency reads own extractions"
    ON extracted_document_data FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()));
    CREATE POLICY "Agency updates own extractions"
    ON extracted_document_data FOR UPDATE
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));
  END IF;

  -- smart_reminders
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'smart_reminders') THEN
    DROP POLICY IF EXISTS "Agency reads own smart reminders" ON smart_reminders;
    DROP POLICY IF EXISTS "Agency updates own smart reminders" ON smart_reminders;
    CREATE POLICY "Agency reads own smart reminders"
    ON smart_reminders FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()));
    CREATE POLICY "Agency updates own smart reminders"
    ON smart_reminders FOR UPDATE
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));
  END IF;

  -- generated_documents
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'generated_documents') THEN
    DROP POLICY IF EXISTS "Agency reads own generated documents" ON generated_documents;
    DROP POLICY IF EXISTS "Agency updates own generated documents" ON generated_documents;
    DROP POLICY IF EXISTS "Agency deletes own generated documents" ON generated_documents;
    CREATE POLICY "Agency reads own generated documents"
    ON generated_documents FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()));
    CREATE POLICY "Agency updates own generated documents"
    ON generated_documents FOR UPDATE
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));
    CREATE POLICY "Agency deletes own generated documents"
    ON generated_documents FOR DELETE
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()));
  END IF;

  -- mistral_ai_usage
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mistral_ai_usage') THEN
    DROP POLICY IF EXISTS "Agency reads own ai usage" ON mistral_ai_usage;
    CREATE POLICY "Agency reads own ai usage"
    ON mistral_ai_usage FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT public.user_agency_ids()));
  END IF;

  -- contract_signature_events
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'contract_signature_events') THEN
    DROP POLICY IF EXISTS "Agency reads own signature events" ON contract_signature_events;
    CREATE POLICY "Agency reads own signature events"
    ON contract_signature_events FOR SELECT
    TO authenticated
    USING (
      project_id IN (
        SELECT id FROM projects WHERE agency_id IN (SELECT public.user_agency_ids())
      )
    );
  END IF;
END $$;
