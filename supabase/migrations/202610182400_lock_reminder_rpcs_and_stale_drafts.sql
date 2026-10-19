-- 1) Verrouiller les RPC claim/finalize (+ helpers) : service_role uniquement.
-- 2) Brouillons smart_reminders obsolètes → status 'stale' + prompt_version.

-- ---------------------------------------------------------------------------
-- Grants : claim / finalize / helpers Paris
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_auto_reminder(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_auto_reminder(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.claim_auto_reminder(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_reminder(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_auto_reminder(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_auto_reminder(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_auto_reminder(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_auto_reminder(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.paris_hour(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paris_hour(TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.paris_hour(TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.paris_hour(TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.is_within_paris_send_window(SMALLINT, SMALLINT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_within_paris_send_window(SMALLINT, SMALLINT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.is_within_paris_send_window(SMALLINT, SMALLINT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_within_paris_send_window(SMALLINT, SMALLINT, TIMESTAMPTZ) TO service_role;

-- reset_reminder_cap : agence authentifiée uniquement (pas anon).
REVOKE ALL ON FUNCTION public.reset_reminder_cap(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_reminder_cap(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_reminder_cap(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_reminder_cap(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- smart_reminders : status 'stale' + prompt_version
-- ---------------------------------------------------------------------------
ALTER TABLE smart_reminders
  ADD COLUMN IF NOT EXISTS prompt_version TEXT;

ALTER TABLE smart_reminders
  DROP CONSTRAINT IF EXISTS smart_reminders_status_check;

ALTER TABLE smart_reminders
  ADD CONSTRAINT smart_reminders_status_check
  CHECK (status IN ('draft', 'sent', 'dismissed', 'stale'));

COMMENT ON COLUMN smart_reminders.prompt_version IS
  'Version du prompt à la génération — brouillons d''une version antérieure passent en stale.';

-- Invalider les brouillons antérieurs à la version courante (dont prompt_version NULL).
-- La version vivante est REMINDER_PROMPT_VERSION dans aiValidation.ts (reminder_v3_…).
UPDATE smart_reminders
SET status = 'stale'
WHERE status = 'draft'
  AND (prompt_version IS NULL OR prompt_version <> 'reminder_v3_2026_10');
