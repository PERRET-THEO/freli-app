CREATE TABLE IF NOT EXISTS checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  order_index INTEGER NOT NULL DEFAULT 0,
  contract_template_id UUID REFERENCES contract_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_template_items_template_id
  ON checklist_template_items(template_id);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency manages own checklist templates' AND tablename = 'checklist_templates'
  ) THEN
    CREATE POLICY "Agency manages own checklist templates"
    ON checklist_templates FOR ALL
    USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()))
    WITH CHECK (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Agency manages own checklist template items' AND tablename = 'checklist_template_items'
  ) THEN
    CREATE POLICY "Agency manages own checklist template items"
    ON checklist_template_items FOR ALL
    USING (template_id IN (
      SELECT ct.id FROM checklist_templates ct
      JOIN agencies a ON ct.agency_id = a.id
      WHERE a.user_id = auth.uid()
    ))
    WITH CHECK (template_id IN (
      SELECT ct.id FROM checklist_templates ct
      JOIN agencies a ON ct.agency_id = a.id
      WHERE a.user_id = auth.uid()
    ));
  END IF;
END
$$;
