-- RPC + cron : finalise les extractions restées en processing > 2 min.
-- Le garde-fou EF ne tourne que sur invoke ; le cron le rend effectif en continu.

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
    AND created_at < now() - interval '2 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.finalize_stale_processing_extractions() IS
  'Marque failed les extractions processing depuis > 2 min (saturation / worker mort).';

REVOKE ALL ON FUNCTION public.finalize_stale_processing_extractions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_stale_processing_extractions() FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_stale_processing_extractions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_stale_processing_extractions() TO service_role;

-- Nettoyage immédiat des zombies existants.
SELECT public.finalize_stale_processing_extractions();

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
