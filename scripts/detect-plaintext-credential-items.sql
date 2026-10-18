-- Lecture seule : items texte susceptibles d'être des secrets en clair.
-- Regex alignée sur migrate-legacy-credentials.

SELECT
  ci.id AS checklist_item_id,
  ci.project_id,
  p.client_name,
  ci.label,
  ci.type,
  ci.completed,
  left(ci.value, 80) AS value_preview,
  length(ci.value) AS value_length
FROM public.checklist_items ci
JOIN public.projects p ON p.id = ci.project_id
WHERE ci.type = 'text'
  AND ci.value IS NOT NULL
  AND length(trim(ci.value)) > 0
  AND ci.label ~* '(acc[eè]s|mot de passe|mdp|identifiant|login|password|compte)'
ORDER BY ci.created_at DESC NULLS LAST, ci.label;

-- Après migration credentials : doit renvoyer 0 lignes.
SELECT count(*) AS credentials_non_sentinel
FROM public.checklist_items
WHERE type = 'credentials'
  AND value IS DISTINCT FROM 'submitted'
  AND value IS DISTINCT FROM 'cleared'
  AND value IS NOT NULL;
