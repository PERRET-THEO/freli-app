-- Durcissement post-advisors Supabase (module devis / factures).
-- 1. Les fonctions de trigger SECURITY DEFINER ne doivent pas être appelables via /rest/v1/rpc.
--    (Un trigger s'exécute sans vérifier le droit EXECUTE de l'appelant.)
REVOKE EXECUTE ON FUNCTION public.sales_document_lines_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_document_lines_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_documents_after_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_documents_links_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_documents_guard() FROM PUBLIC, anon, authenticated;

-- 2. Index sur la clé étrangère devis → facture convertie.
CREATE INDEX IF NOT EXISTS sales_documents_converted_invoice_idx
  ON public.sales_documents (converted_invoice_id) WHERE converted_invoice_id IS NOT NULL;
