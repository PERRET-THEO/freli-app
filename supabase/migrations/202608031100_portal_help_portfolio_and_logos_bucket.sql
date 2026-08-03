-- Portal help block, portfolio CTA, locale stub + logos storage bucket.

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS portal_help_title TEXT DEFAULT 'Besoin d''aide ?',
  ADD COLUMN IF NOT EXISTS portal_help_text TEXT,
  ADD COLUMN IF NOT EXISTS portal_availability TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_url TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_label TEXT DEFAULT 'Voir mon portfolio',
  ADD COLUMN IF NOT EXISTS portal_locale TEXT DEFAULT 'fr';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_portal_locale_check'
  ) THEN
    ALTER TABLE public.agencies
      ADD CONSTRAINT agencies_portal_locale_check
      CHECK (portal_locale IS NULL OR portal_locale IN ('fr', 'en'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_portfolio_url_https_check'
  ) THEN
    ALTER TABLE public.agencies
      ADD CONSTRAINT agencies_portfolio_url_https_check
      CHECK (portfolio_url IS NULL OR portfolio_url ~* '^https://');
  END IF;
END $$;

-- Public logos bucket (agency branding). Read: anyone. Write: authenticated members
-- uploading under their agency folder path `{agency_id}/...`.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read logos" ON storage.objects;
CREATE POLICY "Public read logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "Members upload logos" ON storage.objects;
CREATE POLICY "Members upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT agency_id::text FROM public.agency_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members update logos" ON storage.objects;
CREATE POLICY "Members update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT agency_id::text FROM public.agency_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT agency_id::text FROM public.agency_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members delete logos" ON storage.objects;
CREATE POLICY "Members delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT agency_id::text FROM public.agency_members WHERE user_id = auth.uid()
    )
  );

-- Public-safe view of portal branding (no legal / billing fields).
CREATE OR REPLACE VIEW public.agency_portal_public
WITH (security_invoker = true)
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

GRANT SELECT ON public.agency_portal_public TO anon, authenticated;
