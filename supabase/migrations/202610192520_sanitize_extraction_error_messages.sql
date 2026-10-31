-- Nettoie les error_message d'extraction contenant du JSON / payloads API bruts.

UPDATE public.extracted_document_data
SET error_message = 'Service IA momentanément saturé. Réessayez dans quelques minutes.'
WHERE status = 'failed'
  AND error_message IS NOT NULL
  AND (
    error_message ILIKE '%429%'
    OR error_message ILIKE '%rate limit%'
    OR error_message ILIKE '%resource_exhausted%'
  );

UPDATE public.extracted_document_data
SET error_message = 'Une erreur est survenue. Réessayez.'
WHERE status = 'failed'
  AND error_message IS NOT NULL
  AND error_message IS DISTINCT FROM 'Service IA momentanément saturé. Réessayez dans quelques minutes.'
  AND error_message IS DISTINCT FROM 'Type de document non reconnu (attendu : pièce d''identité, Kbis ou RIB).'
  AND error_message IS DISTINCT FROM 'Aucun champ exploitable extrait'
  AND (
    error_message LIKE '%{%'
    OR error_message ILIKE '%mistral api%'
    OR error_message ILIKE '%gemini api%'
    OR length(error_message) > 220
  );
