-- Price IDs SaaS Freli (fallback si Edge secrets STRIPE_PRICE_* absents)
CREATE TABLE IF NOT EXISTS public.billing_stripe_prices (
  key text PRIMARY KEY,
  price_id text NOT NULL,
  lookup_key text,
  amount_cents integer,
  interval text CHECK (interval IN ('month', 'year')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_stripe_prices ENABLE ROW LEVEL SECURITY;

INSERT INTO public.billing_stripe_prices (key, price_id, lookup_key, amount_cents, interval)
VALUES
  ('STRIPE_PRICE_MONTHLY', 'price_1TxZnVRJAC4QCUrXINBdT4cQ', 'freli_subscription_month', 5900, 'month'),
  ('STRIPE_PRICE_YEARLY', 'price_1TxZnVRJAC4QCUrX040yfDVM', 'freli_subscription_year', 59000, 'year'),
  ('STRIPE_PRICE_AI_MONTHLY', 'price_1TxZnWRJAC4QCUrX1Bb1uqtb', 'freli_ai_month', 2900, 'month'),
  ('STRIPE_PRICE_AI_YEARLY', 'price_1TxZnXRJAC4QCUrXSoZoSTik', 'freli_ai_year', 29000, 'year')
ON CONFLICT (key) DO UPDATE SET
  price_id = EXCLUDED.price_id,
  lookup_key = EXCLUDED.lookup_key,
  amount_cents = EXCLUDED.amount_cents,
  interval = EXCLUDED.interval,
  updated_at = now();
