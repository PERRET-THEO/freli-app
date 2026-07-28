-- Freli SaaS subscription billing (platform Stripe — distinct from Connect client payments)

CREATE TABLE IF NOT EXISTS public.subscription_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pricing', 'admin')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  checkout_session_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'checkout_created'
    CHECK (status IN ('checkout_created', 'paid', 'invite_sent', 'account_linked')),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_leads_email_idx
  ON public.subscription_leads (lower(email));
CREATE INDEX IF NOT EXISTS subscription_leads_status_idx
  ON public.subscription_leads (status);
CREATE INDEX IF NOT EXISTS subscription_leads_created_at_idx
  ON public.subscription_leads (created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL UNIQUE REFERENCES public.agencies(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  billing_interval TEXT CHECK (billing_interval IN ('month', 'year')),
  status TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
  ai_addon_active BOOLEAN NOT NULL DEFAULT false,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_accounts_stripe_customer_idx
  ON public.billing_accounts (stripe_customer_id);
CREATE INDEX IF NOT EXISTS billing_accounts_stripe_subscription_idx
  ON public.billing_accounts (stripe_subscription_id);

ALTER TABLE public.subscription_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated on subscription_leads: service_role only (admin UI via edge functions).

CREATE POLICY billing_accounts_select_member
  ON public.billing_accounts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_members m
      WHERE m.agency_id = billing_accounts.agency_id
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.agencies a
      WHERE a.id = billing_accounts.agency_id
        AND a.user_id = auth.uid()
    )
  );

-- Writes to billing_accounts only via service_role (edge functions / webhooks).
