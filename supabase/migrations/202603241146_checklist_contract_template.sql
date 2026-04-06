ALTER TABLE checklist_items
ADD COLUMN IF NOT EXISTS contract_template_id UUID
REFERENCES contract_templates(id);
