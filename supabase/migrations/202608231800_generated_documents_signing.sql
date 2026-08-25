-- Contrats IA intra-projet : PDF signable et zone signature sur generated_documents
-- (plus d'insertion dans contract_templates à la finalisation)

ALTER TABLE generated_documents
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS signature_page INTEGER DEFAULT -1,
  ADD COLUMN IF NOT EXISTS signature_x DOUBLE PRECISION DEFAULT 0.7,
  ADD COLUMN IF NOT EXISTS signature_y DOUBLE PRECISION DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS signature_width DOUBLE PRECISION DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS signature_height DOUBLE PRECISION DEFAULT 0.08,
  ADD COLUMN IF NOT EXISTS signed_storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_documents_project_status
  ON generated_documents(project_id, status, created_at DESC);

-- Rétro-migration : copier PDF + signature depuis contract_templates liés
UPDATE generated_documents gd
SET
  pdf_storage_path = COALESCE(
    gd.pdf_storage_path,
    CASE
      WHEN ct.pdf_url IS NOT NULL AND NOT ct.pdf_url LIKE 'http%' THEN ct.pdf_url
      WHEN ct.pdf_url IS NOT NULL THEN regexp_replace(ct.pdf_url, '^.*/contracts/', '')
      ELSE NULL
    END
  ),
  signature_page = COALESCE(gd.signature_page, ct.signature_page, -1),
  signature_x = COALESCE(gd.signature_x, ct.signature_x, 0.7),
  signature_y = COALESCE(gd.signature_y, ct.signature_y, 0.85),
  signature_width = COALESCE(gd.signature_width, ct.signature_width, 0.25),
  signature_height = COALESCE(gd.signature_height, ct.signature_height, 0.08)
FROM contract_templates ct
WHERE gd.contract_template_id = ct.id
  AND gd.status = 'finalized'
  AND gd.pdf_storage_path IS NULL;

-- Checklist : remplacer template_id par generated_document_id pour les contrats IA finalisés
UPDATE checklist_items ci
SET
  value = jsonb_build_object(
    'generated_document_id', gd.id::text,
    'status', 'pending'
  )::text,
  contract_template_id = NULL
FROM generated_documents gd
WHERE gd.status = 'finalized'
  AND gd.contract_template_id IS NOT NULL
  AND ci.project_id = gd.project_id
  AND ci.type = 'signature'
  AND (
    (ci.value IS NOT NULL AND ci.value::jsonb->>'template_id' = gd.contract_template_id::text)
    OR ci.contract_template_id = gd.contract_template_id
  );

-- Supprimer les contract_templates créés par l'ancienne finalisation IA (doublons bibliothèque)
DELETE FROM contract_templates ct
WHERE EXISTS (
  SELECT 1 FROM generated_documents gd
  WHERE gd.contract_template_id = ct.id
);

-- Nettoyer la FK obsolète sur les documents déjà migrés
UPDATE generated_documents
SET contract_template_id = NULL
WHERE contract_template_id IS NOT NULL
  AND pdf_storage_path IS NOT NULL;
