-- Relances auto : claim atomique anti-doublon, statut d'envoi, plafond
-- consécutif sans réponse client, reset manuel du plafond.

-- ---------------------------------------------------------------------------
-- project_reminder_logs.status
-- ---------------------------------------------------------------------------
ALTER TABLE project_reminder_logs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent';

ALTER TABLE project_reminder_logs
  DROP CONSTRAINT IF EXISTS project_reminder_logs_status_check;

ALTER TABLE project_reminder_logs
  ADD CONSTRAINT project_reminder_logs_status_check
  CHECK (status IN ('sending', 'sent', 'failed'));

COMMENT ON COLUMN project_reminder_logs.status IS
  'sending = claim réservé avant envoi ; sent = livré ; failed = échec (ne compte pas au plafond).';

CREATE INDEX IF NOT EXISTS idx_project_reminder_logs_project_status_sent
  ON project_reminder_logs (project_id, status, sent_at DESC)
  WHERE source = 'auto';

-- ---------------------------------------------------------------------------
-- projects.reminder_cap_reset_at
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS reminder_cap_reset_at TIMESTAMPTZ;

COMMENT ON COLUMN projects.reminder_cap_reset_at IS
  'Horodatage du reset manuel « J''ai contacté le client » — ancre du compteur de relances auto consécutives.';

-- ---------------------------------------------------------------------------
-- Helpers internes (timezone Paris)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.paris_hour(p_now TIMESTAMPTZ DEFAULT now())
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(HOUR FROM (p_now AT TIME ZONE 'Europe/Paris'))::integer;
$$;

CREATE OR REPLACE FUNCTION public.is_within_paris_send_window(
  p_start SMALLINT,
  p_end SMALLINT,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_hour INTEGER := public.paris_hour(p_now);
  v_start INTEGER := COALESCE(p_start, 9);
  v_end INTEGER := COALESCE(p_end, 19);
BEGIN
  IF v_start = v_end THEN
    RETURN true;
  END IF;
  IF v_start < v_end THEN
    RETURN v_hour >= v_start AND v_hour < v_end;
  END IF;
  RETURN v_hour >= v_start OR v_hour < v_end;
END;
$$;

-- ---------------------------------------------------------------------------
-- claim_auto_reminder : verrouille, vérifie délai/plafond/plage, insert sending
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_auto_reminder(p_project_id UUID)
RETURNS TABLE (
  ok BOOLEAN,
  log_id UUID,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project RECORD;
  v_agency RECORD;
  v_delay_hours INTEGER;
  v_max INTEGER;
  v_hour_start SMALLINT;
  v_hour_end SMALLINT;
  v_anchor TIMESTAMPTZ;
  v_last_activity TIMESTAMPTZ;
  v_max_submitted TIMESTAMPTZ;
  v_consecutive INTEGER;
  v_log_id UUID;
  v_last_log TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_project_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'invalid_project';
    RETURN;
  END IF;

  SELECT
    p.id,
    p.agency_id,
    p.status,
    p.created_at,
    p.last_reminder_sent_at,
    p.last_portal_visit_at,
    p.reminder_cap_reset_at,
    p.client_email
  INTO v_project
  FROM projects p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'project_not_found';
    RETURN;
  END IF;

  IF v_project.status = 'completed' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'project_completed';
    RETURN;
  END IF;

  SELECT
    a.id,
    a.auto_reminders_enabled,
    a.auto_reminders_delay_hours,
    a.ai_reminder_max_per_project,
    a.ai_reminder_send_hour_start,
    a.ai_reminder_send_hour_end
  INTO v_agency
  FROM agencies a
  WHERE a.id = v_project.agency_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'agency_not_found';
    RETURN;
  END IF;

  IF v_agency.auto_reminders_enabled IS FALSE THEN
    RETURN QUERY SELECT false, NULL::uuid, 'auto_disabled';
    RETURN;
  END IF;

  v_delay_hours := COALESCE(v_agency.auto_reminders_delay_hours, 48);
  IF v_delay_hours < 12 THEN
    v_delay_hours := 48;
  END IF;

  v_max := COALESCE(v_agency.ai_reminder_max_per_project, 3);
  IF v_max < 1 THEN
    v_max := 3;
  END IF;

  v_hour_start := COALESCE(v_agency.ai_reminder_send_hour_start, 9);
  v_hour_end := COALESCE(v_agency.ai_reminder_send_hour_end, 19);

  IF NOT public.is_within_paris_send_window(v_hour_start, v_hour_end, v_now) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'outside_send_window';
    RETURN;
  END IF;

  -- Claim concurrent : un envoi déjà en cours.
  IF EXISTS (
    SELECT 1
    FROM project_reminder_logs l
    WHERE l.project_id = p_project_id
      AND l.source = 'auto'
      AND l.status = 'sending'
      AND l.sent_at > v_now - INTERVAL '1 hour'
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'already_claiming';
    RETURN;
  END IF;

  SELECT max(ci.submitted_at)
  INTO v_max_submitted
  FROM checklist_items ci
  WHERE ci.project_id = p_project_id;

  -- Ancre du plafond : dernière activité client ou reset manuel.
  v_anchor := NULL;
  IF v_max_submitted IS NOT NULL THEN
    v_anchor := v_max_submitted;
  END IF;
  IF v_project.last_portal_visit_at IS NOT NULL
     AND (v_anchor IS NULL OR v_project.last_portal_visit_at > v_anchor) THEN
    v_anchor := v_project.last_portal_visit_at;
  END IF;
  IF v_project.reminder_cap_reset_at IS NOT NULL
     AND (v_anchor IS NULL OR v_project.reminder_cap_reset_at > v_anchor) THEN
    v_anchor := v_project.reminder_cap_reset_at;
  END IF;

  SELECT count(*)::integer
  INTO v_consecutive
  FROM project_reminder_logs l
  WHERE l.project_id = p_project_id
    AND l.source = 'auto'
    AND l.status IN ('sent', 'sending')
    AND (v_anchor IS NULL OR l.sent_at > v_anchor);

  IF v_consecutive >= v_max THEN
    RETURN QUERY SELECT false, NULL::uuid, 'cap_reached';
    RETURN;
  END IF;

  -- Délai depuis la dernière activité (création, relance, portail, soumission, reset).
  v_last_activity := v_project.created_at;
  IF v_project.last_reminder_sent_at IS NOT NULL
     AND v_project.last_reminder_sent_at > v_last_activity THEN
    v_last_activity := v_project.last_reminder_sent_at;
  END IF;
  IF v_project.last_portal_visit_at IS NOT NULL
     AND v_project.last_portal_visit_at > v_last_activity THEN
    v_last_activity := v_project.last_portal_visit_at;
  END IF;
  IF v_max_submitted IS NOT NULL AND v_max_submitted > v_last_activity THEN
    v_last_activity := v_max_submitted;
  END IF;
  IF v_project.reminder_cap_reset_at IS NOT NULL
     AND v_project.reminder_cap_reset_at > v_last_activity THEN
    v_last_activity := v_project.reminder_cap_reset_at;
  END IF;

  -- Inclure un claim sending/sent récent dans le délai (défense en profondeur).
  SELECT max(l.sent_at)
  INTO v_last_log
  FROM project_reminder_logs l
  WHERE l.project_id = p_project_id
    AND l.source = 'auto'
    AND l.status IN ('sent', 'sending');
  IF v_last_log IS NOT NULL AND v_last_log > v_last_activity THEN
    v_last_activity := v_last_log;
  END IF;

  IF v_now - v_last_activity <= make_interval(hours => v_delay_hours) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'delay_not_elapsed';
    RETURN;
  END IF;

  INSERT INTO project_reminder_logs (
    project_id,
    agency_id,
    source,
    recipient_email,
    sent_at,
    status
  )
  VALUES (
    p_project_id,
    v_project.agency_id,
    'auto',
    v_project.client_email,
    v_now,
    'sending'
  )
  RETURNING id INTO v_log_id;

  RETURN QUERY SELECT true, v_log_id, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_auto_reminder(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_auto_reminder(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.claim_auto_reminder(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_reminder(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.paris_hour(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paris_hour(TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.paris_hour(TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.paris_hour(TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.is_within_paris_send_window(SMALLINT, SMALLINT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_within_paris_send_window(SMALLINT, SMALLINT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.is_within_paris_send_window(SMALLINT, SMALLINT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_within_paris_send_window(SMALLINT, SMALLINT, TIMESTAMPTZ) TO service_role;

-- ---------------------------------------------------------------------------
-- finalize_auto_reminder
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_auto_reminder(
  p_log_id UUID,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed') THEN
    RETURN false;
  END IF;

  UPDATE project_reminder_logs
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
  WHERE id = p_log_id
    AND status = 'sending'
  RETURNING project_id INTO v_project_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_status = 'sent' THEN
    UPDATE projects
    SET last_reminder_sent_at = now()
    WHERE id = v_project_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_auto_reminder(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_auto_reminder(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_auto_reminder(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_auto_reminder(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- reset_reminder_cap : « J'ai contacté le client — relancer à nouveau »
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_reminder_cap(p_project_id UUID)
RETURNS TABLE (
  ok BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id UUID;
  v_client_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'unauthorized';
    RETURN;
  END IF;

  SELECT p.agency_id, p.client_id
  INTO v_agency_id, v_client_id
  FROM projects p
  WHERE p.id = p_project_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'project_not_found';
    RETURN;
  END IF;

  IF v_agency_id IS NULL OR v_agency_id NOT IN (SELECT public.user_agency_ids()) THEN
    RETURN QUERY SELECT false, 'forbidden';
    RETURN;
  END IF;

  UPDATE projects
  SET reminder_cap_reset_at = v_now
  WHERE id = p_project_id;

  IF v_client_id IS NOT NULL THEN
    INSERT INTO client_activity_events (
      agency_id,
      client_id,
      project_id,
      event_type,
      title,
      metadata,
      occurred_at
    )
    VALUES (
      v_agency_id,
      v_client_id,
      p_project_id,
      'reminder_cap_reset',
      'Agence a contacté le client — relances auto réarmées',
      jsonb_build_object('reset_at', v_now),
      v_now
    );
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_reminder_cap(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_reminder_cap(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_reminder_cap(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_reminder_cap(UUID) TO service_role;
