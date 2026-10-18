-- PR B : secrets checklist chiffrés (AES-GCM côté EF), sentinelles value, activité.

-- ---------------------------------------------------------------------------
-- checklist_item_secrets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_item_secrets (
  checklist_item_id UUID PRIMARY KEY REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ciphertext BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  key_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checklist_item_secrets_nonce_len CHECK (octet_length(nonce) = 12),
  CONSTRAINT checklist_item_secrets_key_version_pos CHECK (key_version >= 1)
);

CREATE INDEX IF NOT EXISTS checklist_item_secrets_project_id_idx
  ON public.checklist_item_secrets (project_id);

ALTER TABLE public.checklist_item_secrets ENABLE ROW LEVEL SECURITY;
-- Aucune policy anon/authenticated : accès service_role uniquement.
REVOKE ALL ON TABLE public.checklist_item_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.checklist_item_secrets FROM anon, authenticated;
GRANT ALL ON TABLE public.checklist_item_secrets TO service_role;

-- ---------------------------------------------------------------------------
-- Garde DB : value credentials ∈ (NULL, submitted, cleared)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checklist_items_credentials_value_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.type = 'credentials' THEN
    IF NEW.value IS NOT NULL
       AND NEW.value IS DISTINCT FROM 'submitted'
       AND NEW.value IS DISTINCT FROM 'cleared' THEN
      RAISE EXCEPTION 'credentials_value_must_be_sentinel'
        USING ERRCODE = 'P0001',
              HINT = 'value must be NULL, submitted, or cleared for type=credentials';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checklist_items_credentials_value_guard ON public.checklist_items;
CREATE TRIGGER checklist_items_credentials_value_guard
  BEFORE INSERT OR UPDATE OF type, value ON public.checklist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.checklist_items_credentials_value_guard();

-- ---------------------------------------------------------------------------
-- Index activité pour rate-limit reveal/copy + timelines projet
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_client_activity_events_project_type_occurred
  ON public.client_activity_events (project_id, event_type, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- portal_load_by_token : redacter value credentials → sentinelle
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
-- approve_or_clear_credentials : transaction atomique (service_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_or_clear_credentials(
  p_item_id uuid,
  p_action text,
  p_erase boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item record;
  v_had_secret boolean := false;
  v_cleared boolean := false;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('approve', 'clear') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, project_id, type, value, completed, config, review_status
  INTO v_item
  FROM public.checklist_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_item.type <> 'credentials' THEN
    RAISE EXCEPTION 'not_credentials' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.checklist_item_secrets s WHERE s.checklist_item_id = p_item_id
  ) INTO v_had_secret;

  IF p_action = 'clear' OR (p_action = 'approve' AND p_erase) THEN
    DELETE FROM public.checklist_item_secrets WHERE checklist_item_id = p_item_id;
    UPDATE public.checklist_items
    SET
      value = 'cleared',
      review_status = CASE WHEN p_action = 'approve' THEN 'approved' ELSE review_status END,
      reviewed_at = CASE WHEN p_action = 'approve' THEN now() ELSE reviewed_at END
    WHERE id = p_item_id;
    v_cleared := true;
  ELSIF p_action = 'approve' THEN
    UPDATE public.checklist_items
    SET review_status = 'approved', reviewed_at = now()
    WHERE id = p_item_id;
  END IF;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'project_id', v_item.project_id,
    'action', p_action,
    'had_secret', v_had_secret,
    'cleared', v_cleared OR (v_item.value = 'cleared' AND NOT v_had_secret),
    'value', (SELECT value FROM public.checklist_items WHERE id = p_item_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_or_clear_credentials(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_or_clear_credentials(uuid, text, boolean) TO service_role;
