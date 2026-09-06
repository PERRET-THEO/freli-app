-- Allow anon client-portal visitors to read safe branding fields only.
-- The previous view used security_invoker=true, so anon still hit agencies RLS
-- (members-only SELECT) and branding came back empty in production.

CREATE OR REPLACE VIEW public.agency_portal_public
WITH (security_invoker = false)
AS
SELECT
  id,
  name,
  logo_url,
  brand_color,
  portal_welcome_message,
  tagline,
  contact_email,
  contact_phone,
  portal_help_title,
  portal_help_text,
  portal_availability,
  portfolio_url,
  portfolio_label,
  portal_locale
FROM public.agencies;

COMMENT ON VIEW public.agency_portal_public IS
  'Public-safe agency branding for the client portal. Runs as owner (bypasses agencies RLS) and exposes no legal/billing columns.';

GRANT SELECT ON public.agency_portal_public TO anon, authenticated;

-- Harden: anon must not SELECT agencies directly (would expose legal/billing).
-- Authenticated access remains governed by existing member RLS policies.
REVOKE ALL ON TABLE public.agencies FROM anon;
