-- Migration : Remplace Docuseal par la signature maison
-- À exécuter dans le SQL Editor de Supabase (https://supabase.com/dashboard/project/xxghfeshnihagvahmmpr/sql)

-- 1. Supprimer la contrainte FK sur checklist_items (si elle existe)
ALTER TABLE checklist_items DROP CONSTRAINT IF EXISTS checklist_items_contract_template_id_fkey;

-- 2. Nettoyer les anciennes références template (les IDs ne seront plus valides)
UPDATE checklist_items SET contract_template_id = NULL WHERE contract_template_id IS NOT NULL;

-- 3. Supprimer les anciennes tables
DROP TABLE IF EXISTS contract_submissions;
DROP TABLE IF EXISTS contract_templates CASCADE;

-- 4. Créer la nouvelle table simplifiée
CREATE TABLE contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  name TEXT NOT NULL,
  pdf_url TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency manages own templates"
ON contract_templates FOR ALL
USING (agency_id IN (
  SELECT id FROM agencies WHERE user_id = auth.uid()
))
WITH CHECK (agency_id IN (
  SELECT id FROM agencies WHERE user_id = auth.uid()
));

CREATE POLICY "Public read templates"
ON contract_templates FOR SELECT USING (true);

-- 5. Rétablir la FK sur checklist_items
ALTER TABLE checklist_items
  ADD CONSTRAINT checklist_items_contract_template_id_fkey
  FOREIGN KEY (contract_template_id) REFERENCES contract_templates(id);

-- 6. Créer le bucket Storage "contracts" (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Politique Storage : tout le monde peut lire, les users authentifiés peuvent écrire
CREATE POLICY "Public read contracts" ON storage.objects
  FOR SELECT USING (bucket_id = 'contracts');

CREATE POLICY "Authenticated upload contracts" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'contracts' AND auth.role() = 'authenticated');

CREATE POLICY "Anon upload contracts" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'contracts' AND auth.role() = 'anon');
