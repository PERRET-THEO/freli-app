-- Nettoyage schéma IA post-migration Mistral → Gemini.
-- Ne supprime aucune table/colonne métier : renommage sémantique + docs + durcissement RPC.

-- ---------------------------------------------------------------------------
-- 1) Pipeline extraction : pixtral_fallback → vision_fallback (legacy conservé)
-- ---------------------------------------------------------------------------
ALTER TABLE public.extracted_document_data
  DROP CONSTRAINT IF EXISTS extracted_document_data_extraction_pipeline_check;

UPDATE public.extracted_document_data
SET extraction_pipeline = 'vision_fallback'
WHERE extraction_pipeline = 'pixtral_fallback';

ALTER TABLE public.extracted_document_data
  ADD CONSTRAINT extracted_document_data_extraction_pipeline_check
  CHECK (
    extraction_pipeline IS NULL
    OR extraction_pipeline IN ('ocr_chat', 'vision_fallback', 'pixtral_fallback')
  );

COMMENT ON COLUMN public.extracted_document_data.extraction_pipeline IS
  'Pipeline extraction : ocr_chat (défaut) ou vision_fallback. pixtral_fallback = alias legacy Mistral.';

COMMENT ON COLUMN public.extracted_document_data.ocr_markdown IS
  'Texte OCR temporaire (Gemini multimodal) ; purgé après review humaine.';

COMMENT ON COLUMN public.extracted_document_data.ocr_pages IS
  'Pages OCR structurées (JSONB) ; purgé après review humaine.';

-- ---------------------------------------------------------------------------
-- 2) Documentation ai_usage_logs (provider-agnostique / Gemini)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.ai_usage_logs IS
  'Journal d''usage IA (Gemini). Écrit uniquement par les Edge Functions (service role).';

COMMENT ON COLUMN public.ai_usage_logs.model IS
  'Identifiant modèle provider (ex. gemini-3.8-flash).';

COMMENT ON COLUMN public.ai_usage_logs.feature IS
  'Module Freli : extraction | reminders | contracts.';

COMMENT ON COLUMN public.ai_usage_logs.operation IS
  'Type d''appel : ocr | chat | vision.';

-- ---------------------------------------------------------------------------
-- 3) Durcir les helpers SECURITY DEFINER (plus d'appel RPC anon/authenticated)
--    Les Edge Functions utilisent la service role — comportement inchangé.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'clear_extraction_ocr_on_review'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    REVOKE ALL ON FUNCTION public.clear_extraction_ocr_on_review() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.clear_extraction_ocr_on_review() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.clear_extraction_ocr_on_review() TO service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'consume_ai_credit'
      AND pg_get_function_identity_arguments(p.oid) = 'p_agency_id uuid, p_reason text, p_feature text, p_ref_id uuid, p_amount integer'
  ) THEN
    REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid, text, text, uuid, integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid, text, text, uuid, integer) FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid, text, text, uuid, integer) TO service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_ai_monthly_credits'
      AND pg_get_function_identity_arguments(p.oid) = 'p_agency_id uuid, p_credits integer'
  ) THEN
    REVOKE ALL ON FUNCTION public.ensure_ai_monthly_credits(uuid, integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.ensure_ai_monthly_credits(uuid, integer) FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ensure_ai_monthly_credits(uuid, integer) TO service_role;
  END IF;
END $$;
