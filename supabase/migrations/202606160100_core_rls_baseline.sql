-- Baseline RLS for core tables (idempotent — safe on existing projects)

CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Mon agence',
  logo_url TEXT,
  plan TEXT,
  brand_color TEXT,
  portal_welcome_message TEXT,
  tagline TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  auto_reminders_enabled BOOLEAN DEFAULT true,
  auto_reminders_delay_hours INTEGER DEFAULT 48,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  client_id UUID,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  price NUMERIC,
  payment_status TEXT,
  stripe_checkout_url TEXT,
  stripe_checkout_session_id TEXT,
  last_reminder_sent_at TIMESTAMPTZ,
  last_payment_email_sent_at TIMESTAMPTZ,
  google_drive_folder_id TEXT,
  google_drive_folder_url TEXT,
  google_drive_files_synced_at TIMESTAMPTZ,
  google_drive_sync_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  required BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  value TEXT,
  contract_template_id UUID REFERENCES contract_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own agency' AND tablename = 'agencies'
  ) THEN
    CREATE POLICY "Users manage own agency"
    ON agencies FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency manages own projects' AND tablename = 'projects'
  ) THEN
    CREATE POLICY "Agency manages own projects"
    ON projects FOR ALL
    TO authenticated
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()))
    WITH CHECK (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Portal reads projects by token' AND tablename = 'projects'
  ) THEN
    CREATE POLICY "Portal reads projects by token"
    ON projects FOR SELECT
    TO anon
    USING (token IS NOT NULL AND length(token) >= 16);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Portal updates project status' AND tablename = 'projects'
  ) THEN
    CREATE POLICY "Portal updates project status"
    ON projects FOR UPDATE
    TO anon
    USING (token IS NOT NULL AND length(token) >= 16)
    WITH CHECK (token IS NOT NULL AND length(token) >= 16);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency manages own checklist items' AND tablename = 'checklist_items'
  ) THEN
    CREATE POLICY "Agency manages own checklist items"
    ON checklist_items FOR ALL
    TO authenticated
    USING (
      project_id IN (
        SELECT id FROM projects
        WHERE agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid())
      )
    )
    WITH CHECK (
      project_id IN (
        SELECT id FROM projects
        WHERE agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid())
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Portal reads checklist items' AND tablename = 'checklist_items'
  ) THEN
    CREATE POLICY "Portal reads checklist items"
    ON checklist_items FOR SELECT
    TO anon
    USING (
      project_id IN (SELECT id FROM projects WHERE token IS NOT NULL AND length(token) >= 16)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Portal updates checklist items' AND tablename = 'checklist_items'
  ) THEN
    CREATE POLICY "Portal updates checklist items"
    ON checklist_items FOR UPDATE
    TO anon
    USING (
      project_id IN (SELECT id FROM projects WHERE token IS NOT NULL AND length(token) >= 16)
    )
    WITH CHECK (
      project_id IN (SELECT id FROM projects WHERE token IS NOT NULL AND length(token) >= 16)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency reads own drive files' AND tablename = 'project_drive_files'
  ) THEN
    CREATE POLICY "Agency reads own drive files"
    ON project_drive_files FOR SELECT
    TO authenticated
    USING (
      project_id IN (
        SELECT id FROM projects
        WHERE agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid())
      )
    );
  END IF;
END $$;
