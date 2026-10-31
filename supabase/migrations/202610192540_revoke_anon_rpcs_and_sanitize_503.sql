-- Ferme EXECUTE anon sur RPCs app (déjà vides pour anon via auth.uid()).
-- Étend le nettoyage des messages IA 503 / high demand / overloaded.

REVOKE EXECUTE ON FUNCTION public.list_clients(uuid, text, text, text, text, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_agency(text) FROM anon;

UPDATE public.extracted_document_data
SET error_message = 'Service IA momentanément saturé. Réessayez dans quelques minutes.'
WHERE status = 'failed'
  AND error_message IS NOT NULL
  AND error_message IS DISTINCT FROM 'Service IA momentanément saturé. Réessayez dans quelques minutes.'
  AND (
    error_message ILIKE '%503%'
    OR error_message ILIKE '%high demand%'
    OR error_message ILIKE '%overloaded%'
    OR error_message ILIKE '%resource_exhausted%'
    OR error_message ILIKE '%rate limit%'
    OR error_message ILIKE '%429%'
  );
