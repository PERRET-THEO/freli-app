-- Payment unlock mode, sticky unlock timestamp, amount_type prep for future deposits.
-- Unlock is based on checklist item `completed` (client submit / contract signed),
-- NOT on agency review_status approval.

-- ---------------------------------------------------------------------------
-- projects columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_unlock_mode text NOT NULL DEFAULT 'after_prerequisites',
  ADD COLUMN IF NOT EXISTS payment_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS amount_type text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS deposit_percent integer;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_payment_unlock_mode_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_payment_unlock_mode_check
  CHECK (payment_unlock_mode IN ('after_prerequisites', 'immediate'));

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_amount_type_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_amount_type_check
  CHECK (amount_type IN ('full', 'deposit'));

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_deposit_percent_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_deposit_percent_check
  CHECK (
    deposit_percent IS NULL
    OR (deposit_percent > 0 AND deposit_percent < 100)
  );

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_amount_type_deposit_consistency;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_amount_type_deposit_consistency
  CHECK (
    (amount_type = 'full' AND deposit_percent IS NULL)
    OR (amount_type = 'deposit' AND deposit_percent IS NOT NULL)
  );

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_payment_status_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_payment_status_check
  CHECK (
    payment_status IS NULL
    OR payment_status IN ('pending', 'paid', 'failed', 'refunded')
  );

-- ---------------------------------------------------------------------------
-- Portal anon column guard: freeze new payment columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.projects_portal_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.role() = 'authenticated' THEN
    RETURN NEW;
  END IF;

  NEW.payment_status := OLD.payment_status;
  NEW.price := OLD.price;
  NEW.stripe_checkout_url := OLD.stripe_checkout_url;
  NEW.stripe_checkout_session_id := OLD.stripe_checkout_session_id;
  NEW.last_payment_email_sent_at := OLD.last_payment_email_sent_at;
  NEW.payment_unlock_mode := OLD.payment_unlock_mode;
  NEW.payment_unlocked_at := OLD.payment_unlocked_at;
  NEW.amount_type := OLD.amount_type;
  NEW.deposit_percent := OLD.deposit_percent;
  NEW.token := OLD.token;
  NEW.agency_id := OLD.agency_id;
  NEW.client_id := OLD.client_id;
  NEW.client_name := OLD.client_name;
  NEW.client_email := OLD.client_email;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.google_drive_folder_id := OLD.google_drive_folder_id;
  NEW.google_drive_folder_url := OLD.google_drive_folder_url;
  NEW.google_drive_files_synced_at := OLD.google_drive_files_synced_at;
  NEW.google_drive_sync_status := OLD.google_drive_sync_status;
  NEW.last_reminder_sent_at := OLD.last_reminder_sent_at;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- portal_load_by_token: expose unlock fields + item.required
-- (keeps credentials value redaction + project.name from prior migrations)
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
    p.last_payment_email_sent_at
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
-- portal_stamp_payment_unlocked: sticky unlock once prerequisites are met
-- (completed = client submit / signed — NOT agency review approval)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_stamp_payment_unlocked(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project record;
  v_payment_order int;
  v_blocking int;
  v_now timestamptz := now();
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    p.id,
    p.price,
    p.payment_unlock_mode,
    p.payment_unlocked_at,
    p.payment_status
  INTO v_project
  FROM public.projects p
  WHERE p.token = p_token
  LIMIT 1;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_project.payment_unlocked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'unlocked', true,
      'payment_unlocked_at', v_project.payment_unlocked_at
    );
  END IF;

  IF v_project.price IS NULL OR v_project.price <= 0 THEN
    RETURN jsonb_build_object('unlocked', false, 'payment_unlocked_at', null);
  END IF;

  IF v_project.payment_unlock_mode = 'immediate' THEN
    UPDATE public.projects
    SET payment_unlocked_at = v_now
    WHERE id = v_project.id AND payment_unlocked_at IS NULL;
    RETURN jsonb_build_object('unlocked', true, 'payment_unlocked_at', v_now);
  END IF;

  SELECT ci.order_index INTO v_payment_order
  FROM public.checklist_items ci
  WHERE ci.project_id = v_project.id AND ci.type = 'payment'
  ORDER BY ci.order_index
  LIMIT 1;

  IF v_payment_order IS NULL THEN
    -- No payment step: unlock when every required item is completed.
    SELECT count(*)::int INTO v_blocking
    FROM public.checklist_items ci
    WHERE ci.project_id = v_project.id
      AND coalesce(ci.required, true) = true
      AND ci.completed = false;
  ELSE
    SELECT count(*)::int INTO v_blocking
    FROM public.checklist_items ci
    WHERE ci.project_id = v_project.id
      AND coalesce(ci.required, true) = true
      AND ci.order_index < v_payment_order
      AND ci.completed = false;
  END IF;

  IF v_blocking > 0 THEN
    RETURN jsonb_build_object('unlocked', false, 'payment_unlocked_at', null);
  END IF;

  UPDATE public.projects
  SET payment_unlocked_at = v_now
  WHERE id = v_project.id AND payment_unlocked_at IS NULL;

  RETURN jsonb_build_object('unlocked', true, 'payment_unlocked_at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_stamp_payment_unlocked(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_stamp_payment_unlocked(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_stamp_payment_unlocked(text) TO service_role;
