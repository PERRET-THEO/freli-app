-- When price / amount fields change, invalidate any open Checkout Session:
-- 1) clear URL + session id immediately (agency UI cannot copy a stale link)
-- 2) queue the Stripe session id for async expire via Edge Function + pg_cron

CREATE TABLE IF NOT EXISTS public.stripe_checkout_expire_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  session_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text
);

CREATE INDEX IF NOT EXISTS stripe_checkout_expire_queue_pending_idx
  ON public.stripe_checkout_expire_queue (created_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.stripe_checkout_expire_queue ENABLE ROW LEVEL SECURITY;
-- service_role only (no anon/authenticated policies)

CREATE OR REPLACE FUNCTION public.projects_invalidate_checkout_on_amount_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Already paid: never touch checkout / queue.
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
    INSERT INTO public.stripe_checkout_expire_queue (project_id, session_id)
    VALUES (OLD.id, OLD.stripe_checkout_session_id);

    NEW.stripe_checkout_url := NULL;
    NEW.stripe_checkout_session_id := NULL;
    -- Old emailed link targets the previous amount — drop the "sent" marker.
    NEW.last_payment_email_sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_invalidate_checkout_on_amount_change_trg ON public.projects;
CREATE TRIGGER projects_invalidate_checkout_on_amount_change_trg
  BEFORE UPDATE OF price, amount_type, deposit_percent ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.projects_invalidate_checkout_on_amount_change();

-- Cron: expire queued Checkout sessions every minute (pg_net + service role JWT).
-- pg_net may already be enabled by other jobs; CREATE EXTENSION is idempotent.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-stripe-checkouts') THEN
    PERFORM cron.unschedule('expire-stale-stripe-checkouts');
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-stale-stripe-checkouts',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xxghfeshnihagvahmmpr.supabase.co/functions/v1/expire-stale-checkouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
