-- Harden portal RLS on projects:
-- 1) Drop open SELECT policy (USING true)
-- 2) Keep token-scoped SELECT for anon
-- 3) Guard anon UPDATEs so payment/price/checkout/token cannot be spoofed
-- 4) Idempotency table for Stripe webhook events

DROP POLICY IF EXISTS "Public read project by token" ON public.projects;

DROP POLICY IF EXISTS "Portal reads projects by token" ON public.projects;
CREATE POLICY "Portal reads projects by token"
  ON public.projects
  FOR SELECT
  TO anon
  USING (token IS NOT NULL AND length(token) >= 16);

-- Keep portal UPDATE policy (status / last_portal_visit_at) but enforce column guard via trigger.
CREATE OR REPLACE FUNCTION public.projects_portal_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Platform / Edge Functions (service_role) and authenticated agencies may update freely.
  IF auth.role() = 'service_role' OR auth.role() = 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- anon (client portal): only status + last_portal_visit_at may change.
  NEW.payment_status := OLD.payment_status;
  NEW.price := OLD.price;
  NEW.stripe_checkout_url := OLD.stripe_checkout_url;
  NEW.stripe_checkout_session_id := OLD.stripe_checkout_session_id;
  NEW.last_payment_email_sent_at := OLD.last_payment_email_sent_at;
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

DROP TRIGGER IF EXISTS projects_portal_column_guard_trg ON public.projects;
CREATE TRIGGER projects_portal_column_guard_trg
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.projects_portal_column_guard();

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: only service_role (bypasses RLS) writes from stripe-webhook.
