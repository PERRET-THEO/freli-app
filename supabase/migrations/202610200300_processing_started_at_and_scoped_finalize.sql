-- 1) processing_started_at : horodatage du DERNIER passage en processing (retry-safe).
-- 2) Cron/RPC filtrés sur processing_started_at (plus created_at).
-- 3) finalize global = service_role only ; RPC scoped agence pour authenticated.
-- 4) generating_started_at sur smart_reminders + cron stale serveur (5 min).

-- ---------------------------------------------------------------------------
-- Extractions
-- ---------------------------------------------------------------------------
ALTER TABLE public.extracted_document_data
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

UPDATE public.extracted_document_data
SET processing_started_at = created_at
WHERE status = 'processing'
  AND processing_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.finalize_stale_processing_extractions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.extracted_document_data
  SET
    status = 'failed',
    error_message = 'Service IA momentanément saturé. Réessayez dans quelques minutes.'
  WHERE status = 'processing'
    AND processing_started_at IS NOT NULL
    AND processing_started_at < now() - interval '2 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.finalize_stale_processing_extractions() IS
  'Cron / service_role : failed les processing dont processing_started_at > 2 min.';

REVOKE ALL ON FUNCTION public.finalize_stale_processing_extractions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_stale_processing_extractions() FROM anon;
REVOKE ALL ON FUNCTION public.finalize_stale_processing_extractions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_stale_processing_extractions() TO service_role;

-- Scoped à l'agence de l'appelant (chargement fiche projet).
CREATE OR REPLACE FUNCTION public.finalize_stale_processing_extractions_for_agency(p_agency_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_agency_id IS NULL OR p_agency_id NOT IN (SELECT public.user_agency_ids()) THEN
    RAISE EXCEPTION 'agency_forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.extracted_document_data
  SET
    status = 'failed',
    error_message = 'Service IA momentanément saturé. Réessayez dans quelques minutes.'
  WHERE status = 'processing'
    AND agency_id = p_agency_id
    AND processing_started_at IS NOT NULL
    AND processing_started_at < now() - interval '2 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.finalize_stale_processing_extractions_for_agency(uuid) IS
  'Authenticated : finalise processing stale pour une agence dont l’appelant est membre.';

REVOKE ALL ON FUNCTION public.finalize_stale_processing_extractions_for_agency(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_stale_processing_extractions_for_agency(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_stale_processing_extractions_for_agency(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_stale_processing_extractions_for_agency(uuid) TO service_role;

-- Cron : garde la fonction globale service_role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finalize-stale-processing-extractions') THEN
    PERFORM cron.unschedule('finalize-stale-processing-extractions');
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'finalize-stale-processing-extractions',
  '* * * * *',
  $$SELECT public.finalize_stale_processing_extractions()$$
);

-- ---------------------------------------------------------------------------
-- Smart reminders : generating_started_at + stale serveur (5 min)
-- ---------------------------------------------------------------------------
ALTER TABLE public.smart_reminders
  ADD COLUMN IF NOT EXISTS generating_started_at timestamptz;

UPDATE public.smart_reminders
SET generating_started_at = created_at
WHERE status = 'generating'
  AND generating_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.finalize_stale_generating_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- 5 min : Gemini peut dépasser 2 min sur les corrections.
  UPDATE public.smart_reminders
  SET status = 'stale'
  WHERE status = 'generating'
    AND generating_started_at IS NOT NULL
    AND generating_started_at < now() - interval '5 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_stale_generating_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_stale_generating_reminders() FROM anon;
REVOKE ALL ON FUNCTION public.finalize_stale_generating_reminders() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_stale_generating_reminders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finalize-stale-generating-reminders') THEN
    PERFORM cron.unschedule('finalize-stale-generating-reminders');
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'finalize-stale-generating-reminders',
  '* * * * *',
  $$SELECT public.finalize_stale_generating_reminders()$$
);
