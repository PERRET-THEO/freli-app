-- Portail : first_name + company_name client ; placeholders builtins sur items existants.

-- ---------------------------------------------------------------------------
-- portal_load_by_token : exposer client_first_name + client_company_name
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_load_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project record;
  v_items jsonb;
  v_branding jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    p.id,
    p.name,
    p.client_name,
    p.client_email,
    p.status,
    p.agency_id,
    p.price,
    p.payment_status,
    p.stripe_checkout_url,
    p.payment_unlock_mode,
    p.payment_unlocked_at,
    p.amount_type,
    p.deposit_percent,
    p.last_payment_email_sent_at,
    c.first_name AS client_first_name,
    c.company_name AS client_company_name
  INTO v_project
  FROM public.projects p
  LEFT JOIN public.clients c ON c.id = p.client_id
  WHERE p.token = p_token
  LIMIT 1;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(i)::jsonb ORDER BY i.order_index), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      ci.id,
      ci.label,
      ci.type,
      ci.completed,
      ci.required,
      CASE
        WHEN ci.type = 'credentials' THEN
          CASE
            WHEN ci.value IN ('submitted', 'cleared') THEN ci.value
            ELSE NULL
          END
        ELSE ci.value
      END AS value,
      ci.order_index,
      ci.review_status,
      ci.review_note,
      ci.config
    FROM public.checklist_items ci
    WHERE ci.project_id = v_project.id
    ORDER BY ci.order_index ASC
  ) i;

  SELECT to_jsonb(b)
  INTO v_branding
  FROM public.agency_portal_public b
  WHERE b.id = v_project.agency_id;

  RETURN jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'client_name', v_project.client_name,
      'client_email', v_project.client_email,
      'client_first_name', v_project.client_first_name,
      'client_company_name', v_project.client_company_name,
      'status', v_project.status,
      'agency_id', v_project.agency_id,
      'price', v_project.price,
      'payment_status', v_project.payment_status,
      'stripe_checkout_url', v_project.stripe_checkout_url,
      'payment_unlock_mode', v_project.payment_unlock_mode,
      'payment_unlocked_at', v_project.payment_unlocked_at,
      'amount_type', v_project.amount_type,
      'deposit_percent', v_project.deposit_percent,
      'last_payment_email_sent_at', v_project.last_payment_email_sent_at
    ),
    'items', v_items,
    'branding', COALESCE(v_branding, 'null'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_load_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_load_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_load_by_token(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Backfill config.placeholder pour libellés builtins (items + template items)
-- ---------------------------------------------------------------------------
WITH placeholder_map(label, placeholder) AS (
  VALUES
    ('Brief', 'Décrivez votre projet, vos objectifs…'),
    ('Brief technique', 'Décrivez le besoin technique, stack et contraintes…'),
    ('Brief créatif', 'Décrivez l’ambiance, les références et le message…'),
    ('Brief détaillé', 'Décrivez votre projet, vos objectifs…'),
    ('Formulaire de brief rempli', 'Résumez les réponses clés du brief…'),
    ('Contenu pages', 'Listez les pages souhaitées et leur contenu…'),
    ('Nom de domaine actuel', 'exemple.fr'),
    ('Spécifications', 'Listez les fonctionnalités et contraintes…'),
    ('Formats souhaités', 'Ex. logo SVG, charte PDF, déclinaisons…'),
    ('Objectifs de la mission', 'Quels résultats attendez-vous ?'),
    ('Interlocuteur principal', 'Prénom Nom'),
    ('Moyens de paiement souhaités', 'Ex. CB, virement, PayPal…'),
    ('Lieu & date de tournage', 'Ville, adresse, date et créneau…')
)
UPDATE public.checklist_items ci
SET config = COALESCE(ci.config, '{}'::jsonb) || jsonb_build_object('placeholder', pm.placeholder)
FROM placeholder_map pm
WHERE ci.label = pm.label
  AND nullif(trim(ci.config ->> 'placeholder'), '') IS NULL;

WITH placeholder_map(label, placeholder) AS (
  VALUES
    ('Brief', 'Décrivez votre projet, vos objectifs…'),
    ('Brief technique', 'Décrivez le besoin technique, stack et contraintes…'),
    ('Brief créatif', 'Décrivez l’ambiance, les références et le message…'),
    ('Brief détaillé', 'Décrivez votre projet, vos objectifs…'),
    ('Formulaire de brief rempli', 'Résumez les réponses clés du brief…'),
    ('Contenu pages', 'Listez les pages souhaitées et leur contenu…'),
    ('Nom de domaine actuel', 'exemple.fr'),
    ('Spécifications', 'Listez les fonctionnalités et contraintes…'),
    ('Formats souhaités', 'Ex. logo SVG, charte PDF, déclinaisons…'),
    ('Objectifs de la mission', 'Quels résultats attendez-vous ?'),
    ('Interlocuteur principal', 'Prénom Nom'),
    ('Moyens de paiement souhaités', 'Ex. CB, virement, PayPal…'),
    ('Lieu & date de tournage', 'Ville, adresse, date et créneau…')
)
UPDATE public.checklist_template_items cti
SET config = COALESCE(cti.config, '{}'::jsonb) || jsonb_build_object('placeholder', pm.placeholder)
FROM placeholder_map pm
WHERE cti.label = pm.label
  AND nullif(trim(cti.config ->> 'placeholder'), '') IS NULL;
