CREATE TABLE contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  name TEXT NOT NULL,
  docuseal_template_id INTEGER NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE contract_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  checklist_item_id UUID REFERENCES checklist_items(id),
  docuseal_submission_id INTEGER,
  docuseal_signing_url TEXT,
  status TEXT DEFAULT 'pending',
  signed_at TIMESTAMPTZ,
  document_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency manages own templates"
ON contract_templates FOR ALL
USING (agency_id IN (
  SELECT id FROM agencies WHERE user_id = auth.uid()
));

CREATE POLICY "Agency manages own submissions"
ON contract_submissions FOR ALL
USING (project_id IN (
  SELECT p.id FROM projects p
  JOIN agencies a ON p.agency_id = a.id
  WHERE a.user_id = auth.uid()
));

CREATE POLICY "Public read submissions"
ON contract_submissions FOR SELECT USING (true);
