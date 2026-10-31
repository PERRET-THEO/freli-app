-- Finalise les extractions restées en processing (worker timeout / retries).
UPDATE public.extracted_document_data
SET
  status = 'failed',
  error_message = 'Service IA momentanément saturé. Réessayez dans quelques minutes.'
WHERE status = 'processing'
  AND created_at < now() - interval '2 minutes';
