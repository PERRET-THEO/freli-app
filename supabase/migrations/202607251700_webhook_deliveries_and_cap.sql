-- Cap webhook integrations per user + delivery journal

CREATE OR REPLACE FUNCTION public.enforce_max_webhooks_per_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider = 'webhook' THEN
    IF (
      SELECT COUNT(*)::int
      FROM public.integrations
      WHERE user_id = NEW.user_id
        AND provider = 'webhook'
    ) >= 5 THEN
      RAISE EXCEPTION 'Maximum 5 webhooks par compte';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_webhooks_per_user ON public.integrations;
CREATE TRIGGER trg_enforce_max_webhooks_per_user
  BEFORE INSERT ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_webhooks_per_user();

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  http_status INT,
  error TEXT,
  attempt INT NOT NULL DEFAULT 1,
  payload_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_created_idx
  ON public.webhook_deliveries (webhook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_user_created_idx
  ON public.webhook_deliveries (user_id, created_at DESC);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Users read own webhook deliveries"
  ON public.webhook_deliveries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
