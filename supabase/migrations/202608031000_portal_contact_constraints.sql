-- Soft contact constraints for portal branding.
-- No strict CHECK on contact_email / contact_phone: existing rows may be invalid
-- and would break unrelated UPDATEs. Normalization happens app-side on save.

COMMENT ON COLUMN public.agencies.contact_email IS
  'Optional portal contact email; validated and trimmed in the app on save.';

COMMENT ON COLUMN public.agencies.contact_phone IS
  'Optional portal contact phone stored as E.164 when possible; validated in the app on save.';
