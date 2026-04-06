ALTER TABLE checklist_items
DROP CONSTRAINT IF EXISTS checklist_items_contract_template_id_fkey;

ALTER TABLE checklist_items
ADD CONSTRAINT checklist_items_contract_template_id_fkey
FOREIGN KEY (contract_template_id)
REFERENCES contract_templates(id)
ON DELETE SET NULL;
