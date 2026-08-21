-- Liste d'attente du lancement public (lancement.freli.fr).
-- Accès uniquement via Edge Function (service_role). Aucune policy anon/authenticated.

CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  email TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'lancement.freli.fr',
  consent_at TIMESTAMPTZ NOT NULL,
  consent_text_version TEXT NOT NULL DEFAULT 'lancement-v1',
  notified_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_signups_first_name_len
    CHECK (char_length(trim(first_name)) >= 1 AND char_length(first_name) <= 80),
  CONSTRAINT waitlist_signups_email_format_check
    CHECK (
      email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
      AND char_length(email) <= 254
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_lower_idx
  ON public.waitlist_signups (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_unsubscribe_token_idx
  ON public.waitlist_signups (unsubscribe_token);

CREATE INDEX IF NOT EXISTS waitlist_signups_created_at_idx
  ON public.waitlist_signups (created_at DESC);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.waitlist_signups FROM anon, authenticated;
GRANT ALL ON TABLE public.waitlist_signups TO service_role;
