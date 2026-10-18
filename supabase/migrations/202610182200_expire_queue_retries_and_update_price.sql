-- A) Harden checkout expire queue (Connect account id, retries)
-- B) RPC update_project_price for ProjectDetail amount edits
-- Fix cron auth via app_internal_secrets (service_role setting was empty → 401)

-- ---------------------------------------------------------------------------
-- Shared cron secret (readable by service_role / SECURITY DEFINER only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_internal_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_internal_secrets ENABLE ROW LEVEL SECURITY;
-- No policies: anon/authenticated cannot read; service_role bypasses RLS.

INSERT INTO public.app_internal_secrets (key, value)
VALUES ('cron_shared', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Queue: stripe_account_id + attempts / last_error (keep row until success)
-- ---------------------------------------------------------------------------
ALTER TABLE public.stripe_checkout_expire_queue
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- Backfill Connect account ids for pending rows
UPDATE public.stripe_checkout_expire_queue q
SET stripe_account_id = i.config->>'stripe_connect_account_id'
FROM public.projects p
JOIN public.agencies a ON a.id = p.agency_id
JOIN public.integrations i ON i.user_id = a.user_id AND i.provider = 'stripe'
WHERE q.project_id = p.id
  AND q.processed_at IS NULL
  AND q.stripe_account_id IS NULL
  AND coalesce(i.config->>'stripe_connect_account_id', '') LIKE 'acct_%';

-- Allow fractional euros (2 decimals) for project prices
DROP TRIGGER IF EXISTS projects_invalidate_checkout_on_amount_change_trg ON public.projects;

ALTER TABLE public.projects
  ALTER COLUMN price TYPE numeric(12, 2)
  USING price::numeric(12, 2);

-- ---------------------------------------------------------------------------
-- Trigger: enqueue with stripe_account_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.projects_invalidate_checkout_on_amount_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payment_status, OLD.payment_status) = 'paid' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.price IS DISTINCT FROM OLD.price
    OR NEW.amount_type IS DISTINCT FROM OLD.amount_type
    OR NEW.deposit_percent IS DISTINCT FROM OLD.deposit_percent
  )
  AND OLD.stripe_checkout_session_id IS NOT NULL
  THEN
    SELECT i.config->>'stripe_connect_account_id'
    INTO v_account_id
    FROM public.agencies a
    JOIN public.integrations i
      ON i.user_id = a.user_id AND i.provider = 'stripe'
    WHERE a.id = OLD.agency_id
    LIMIT 1;

    INSERT INTO public.stripe_checkout_expire_queue (
      project_id, session_id, stripe_account_id
    )
    VALUES (OLD.id, OLD.stripe_checkout_session_id, nullif(v_account_id, ''));

    NEW.stripe_checkout_url := NULL;
    NEW.stripe_checkout_session_id := NULL;
    NEW.last_payment_email_sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_invalidate_checkout_on_amount_change_trg
  BEFORE UPDATE OF price, amount_type, deposit_percent ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.projects_invalidate_checkout_on_amount_change();

-- ---------------------------------------------------------------------------
-- Cron: send x-cron-secret from app_internal_secrets (fixes 401)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-stripe-checkouts') THEN
    PERFORM cron.unschedule('expire-stale-stripe-checkouts');
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-stale-stripe-checkouts',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xxghfeshnihagvahmmpr.supabase.co/functions/v1/expire-stale-checkouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        SELECT value FROM public.app_internal_secrets WHERE key = 'cron_shared' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- ---------------------------------------------------------------------------
-- RPC: update_project_price
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_project_price(
  p_project_id uuid,
  p_price numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project record;
  v_old_price numeric(12, 2);
  v_new_price numeric(12, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'invalid_price' USING ERRCODE = 'P0001';
  END IF;

  -- Max 2 decimal places
  IF round(p_price, 2) <> p_price THEN
    RAISE EXCEPTION 'invalid_price_decimals' USING ERRCODE = 'P0001';
  END IF;

  v_new_price := round(p_price, 2);

  SELECT
    p.id,
    p.agency_id,
    p.client_id,
    p.price,
    p.payment_status,
    p.stripe_checkout_session_id,
    p.last_payment_email_sent_at
  INTO v_project
  FROM public.projects p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_project.agency_id IS NULL
     OR v_project.agency_id NOT IN (SELECT public.user_agency_ids()) THEN
    RAISE EXCEPTION 'forbidden_agency' USING ERRCODE = 'P0001';
  END IF;

  IF v_project.payment_status IN ('paid', 'refunded') THEN
    RAISE EXCEPTION 'price_locked_after_payment' USING ERRCODE = 'P0001';
  END IF;

  v_old_price := v_project.price;

  IF v_old_price IS NOT DISTINCT FROM v_new_price THEN
    RETURN jsonb_build_object(
      'project_id', v_project.id,
      'price', v_new_price,
      'changed', false,
      'had_checkout_session', v_project.stripe_checkout_session_id IS NOT NULL,
      'had_payment_email', v_project.last_payment_email_sent_at IS NOT NULL
    );
  END IF;

  UPDATE public.projects
  SET price = v_new_price
  WHERE id = v_project.id;

  IF v_project.client_id IS NOT NULL THEN
    INSERT INTO public.client_activity_events (
      agency_id, client_id, project_id, event_type, title, metadata
    ) VALUES (
      v_project.agency_id,
      v_project.client_id,
      v_project.id,
      'payment.amount_changed',
      format(
        'Montant modifié : %s € → %s €',
        COALESCE(to_char(v_old_price, 'FM999999990.00'), '—'),
        to_char(v_new_price, 'FM999999990.00')
      ),
      jsonb_build_object(
        'old_price', v_old_price,
        'new_price', v_new_price
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', v_project.id,
    'price', v_new_price,
    'old_price', v_old_price,
    'changed', true,
    'had_checkout_session', v_project.stripe_checkout_session_id IS NOT NULL,
    'had_payment_email', v_project.last_payment_email_sent_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_project_price(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_project_price(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_price(uuid, numeric) TO service_role;
