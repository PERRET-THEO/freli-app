-- PR A migration 1 (additive) : RPC portail token-bound.
-- Ne DROP aucune policy anon — migration 2 s'en charge après déploiement front.

CREATE TABLE IF NOT EXISTS public.portal_rate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_rate_events_kind_subject_created_idx
  ON public.portal_rate_events (kind, subject, created_at DESC);

ALTER TABLE public.portal_rate_events ENABLE ROW LEVEL SECURITY;
-- Aucune policy anon/authenticated : écriture service_role uniquement.

-- ---------------------------------------------------------------------------
-- portal_load_by_token
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
    p.client_name,
    p.client_email,
    p.status,
    p.agency_id,
    p.price,
    p.payment_status,
    p.stripe_checkout_url
  INTO v_project
  FROM public.projects p
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
      ci.value,
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
      'client_name', v_project.client_name,
      'client_email', v_project.client_email,
      'status', v_project.status,
      'agency_id', v_project.agency_id,
      'price', v_project.price,
      'payment_status', v_project.payment_status,
      'stripe_checkout_url', v_project.stripe_checkout_url
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
-- portal_touch_visit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_touch_visit(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.projects
  SET last_portal_visit_at = now()
  WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_touch_visit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_touch_visit(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_touch_visit(text) TO service_role;

-- ---------------------------------------------------------------------------
-- portal_set_project_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_set_project_status(p_token text, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0001';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('pending', 'in_progress', 'completed') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.projects
  SET status = p_status
  WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_set_project_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_set_project_status(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_set_project_status(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- portal_update_checklist_item
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_update_checklist_item(
  p_token text,
  p_item_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_item record;
  v_value text;
  v_completed boolean;
  v_prefix text;
  v_known_types text[] := ARRAY[
    'text', 'file', 'signature', 'email', 'phone', 'url', 'choice', 'payment', 'schedule', 'credentials'
  ];
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0001';
  END IF;

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'invalid_item' USING ERRCODE = 'P0001';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id INTO v_project_id
  FROM public.projects p
  WHERE p.token = p_token
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT ci.id, ci.project_id, ci.type, ci.value, ci.completed
  INTO v_item
  FROM public.checklist_items ci
  WHERE ci.id = p_item_id
  LIMIT 1;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_item.project_id <> v_project_id THEN
    RAISE EXCEPTION 'forbidden_cross_project' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (v_item.type = ANY (v_known_types)) THEN
    RAISE EXCEPTION 'invalid_type' USING ERRCODE = 'P0001';
  END IF;

  IF v_item.type = 'credentials' THEN
    RAISE EXCEPTION 'credentials_via_rpc_forbidden' USING ERRCODE = 'P0001';
  END IF;

  -- Le portail ne fixe pas review_status librement.
  IF p_payload ? 'review_status'
     AND COALESCE(p_payload->>'review_status', '') NOT IN ('', 'pending') THEN
    RAISE EXCEPTION 'review_status_forbidden' USING ERRCODE = 'P0001';
  END IF;

  IF p_payload ? 'type' OR p_payload ? 'project_id' OR p_payload ? 'order_index' THEN
    RAISE EXCEPTION 'immutable_fields' USING ERRCODE = 'P0001';
  END IF;

  v_value := COALESCE(p_payload->>'value', v_item.value);
  v_completed := COALESCE((p_payload->>'completed')::boolean, v_item.completed);

  -- file/signature : tout path (non-URL) doit être sous {project_id}/{item_id}/
  IF v_item.type IN ('file', 'signature')
     AND v_value IS NOT NULL
     AND btrim(v_value) <> ''
     AND v_value !~ '^https?://' THEN
    v_prefix := v_project_id::text || '/' || p_item_id::text || '/';
    IF left(v_value, length(v_prefix)) <> v_prefix THEN
      RAISE EXCEPTION 'invalid_storage_path' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.checklist_items ci
  SET
    value = v_value,
    completed = v_completed,
    review_status = CASE
      WHEN v_completed THEN 'pending'
      ELSE ci.review_status
    END,
    review_note = CASE
      WHEN v_completed THEN NULL
      ELSE ci.review_note
    END,
    submitted_at = CASE
      WHEN v_completed THEN COALESCE(
        NULLIF(p_payload->>'submitted_at', '')::timestamptz,
        now()
      )
      ELSE ci.submitted_at
    END
  WHERE ci.id = p_item_id;

  RETURN (
    SELECT jsonb_build_object(
      'id', ci.id,
      'label', ci.label,
      'type', ci.type,
      'completed', ci.completed,
      'value', ci.value,
      'order_index', ci.order_index,
      'review_status', ci.review_status,
      'review_note', ci.review_note,
      'config', ci.config
    )
    FROM public.checklist_items ci
    WHERE ci.id = p_item_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_update_checklist_item(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_update_checklist_item(text, uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_update_checklist_item(text, uuid, jsonb) TO service_role;

-- Normalise les value file stockées en URL publique documents → path relatif.
UPDATE public.checklist_items ci
SET value = substring(
  ci.value
  FROM 'documents/(.+)$'
)
WHERE ci.type = 'file'
  AND ci.value IS NOT NULL
  AND ci.value LIKE '%/storage/v1/object/%/documents/%';
