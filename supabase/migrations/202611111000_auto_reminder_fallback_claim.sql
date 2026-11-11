-- Relances auto : réservation unique partagée par les relances IA et classiques.
--
-- 1. claim_auto_reminder accepte un délai de grâce (p_grace_hours, défaut 0).
--    Le batch classique s'en sert comme filet de sécurité pour les agences IA :
--    il ne relance un projet IA que s'il est en retard de plus de 24 h
--    (le batch IA n'a pas tourné ou n'a pas pu envoyer).
-- 2. Une réservation 'sending' vieille de plus d'1 h (batch coupé en plein vol)
--    est libérée ('failed') : elle ne bloque plus ni le délai ni le plafond.
--
-- Le verrou FOR UPDATE sur le projet + le refus 'already_claiming' garantissent
-- qu'une seule relance (IA ou classique) part pour un projet donné.

DROP FUNCTION IF EXISTS public.claim_auto_reminder(UUID);

CREATE OR REPLACE FUNCTION public.claim_auto_reminder(
  p_project_id UUID,
  p_grace_hours INTEGER DEFAULT 0
)
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
  v_grace_hours INTEGER := GREATEST(COALESCE(p_grace_hours, 0), 0);
  v_max INTEGER;
  v_hour_start SMALLINT;
  v_hour_end SMALLINT;
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
    p.id, p.agency_id, p.status, p.created_at, p.last_reminder_sent_at,
    p.last_portal_visit_at, p.reminder_cap_reset_at, p.client_email
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

  -- Réservations orphelines (batch coupé avant finalisation) : libérées.
  UPDATE project_reminder_logs l
  SET status = 'failed'
  WHERE l.project_id = p_project_id
    AND l.source = 'auto'
    AND l.status = 'sending'
    AND l.sent_at <= v_now - INTERVAL '1 hour';

  SELECT a.id, a.auto_reminders_enabled, a.auto_reminders_delay_hours,
         a.ai_reminder_max_per_project, a.ai_reminder_send_hour_start, a.ai_reminder_send_hour_end
  INTO v_agency FROM agencies a WHERE a.id = v_project.agency_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'agency_not_found';
    RETURN;
  END IF;

  IF v_agency.auto_reminders_enabled IS FALSE THEN
    RETURN QUERY SELECT false, NULL::uuid, 'auto_disabled';
    RETURN;
  END IF;

  v_delay_hours := COALESCE(v_agency.auto_reminders_delay_hours, 48);
  IF v_delay_hours < 12 THEN v_delay_hours := 48; END IF;

  v_max := COALESCE(v_agency.ai_reminder_max_per_project, 3);
  IF v_max < 1 THEN v_max := 3; END IF;

  v_hour_start := COALESCE(v_agency.ai_reminder_send_hour_start, 9);
  v_hour_end := COALESCE(v_agency.ai_reminder_send_hour_end, 19);

  IF NOT public.is_within_paris_send_window(v_hour_start, v_hour_end, v_now) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'outside_send_window';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM project_reminder_logs l
    WHERE l.project_id = p_project_id AND l.source = 'auto'
      AND l.status = 'sending' AND l.sent_at > v_now - INTERVAL '1 hour'
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'already_claiming';
    RETURN;
  END IF;

  v_consecutive := public.project_consecutive_auto_reminders(p_project_id);
  IF v_consecutive >= v_max THEN
    RETURN QUERY SELECT false, NULL::uuid, 'cap_reached';
    RETURN;
  END IF;

  SELECT max(ci.submitted_at) INTO v_max_submitted
  FROM checklist_items ci WHERE ci.project_id = p_project_id;

  v_last_activity := v_project.created_at;
  IF v_project.last_reminder_sent_at IS NOT NULL AND v_project.last_reminder_sent_at > v_last_activity THEN
    v_last_activity := v_project.last_reminder_sent_at;
  END IF;
  IF v_project.last_portal_visit_at IS NOT NULL AND v_project.last_portal_visit_at > v_last_activity THEN
    v_last_activity := v_project.last_portal_visit_at;
  END IF;
  IF v_max_submitted IS NOT NULL AND v_max_submitted > v_last_activity THEN
    v_last_activity := v_max_submitted;
  END IF;
  IF v_project.reminder_cap_reset_at IS NOT NULL AND v_project.reminder_cap_reset_at > v_last_activity THEN
    v_last_activity := v_project.reminder_cap_reset_at;
  END IF;

  SELECT max(l.sent_at) INTO v_last_log
  FROM project_reminder_logs l
  WHERE l.project_id = p_project_id AND l.source = 'auto' AND l.status IN ('sent', 'sending');
  IF v_last_log IS NOT NULL AND v_last_log > v_last_activity THEN
    v_last_activity := v_last_log;
  END IF;

  IF v_now - v_last_activity <= make_interval(hours => v_delay_hours + v_grace_hours) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'delay_not_elapsed';
    RETURN;
  END IF;

  INSERT INTO project_reminder_logs (project_id, agency_id, source, recipient_email, sent_at, status)
  VALUES (p_project_id, v_project.agency_id, 'auto', v_project.client_email, v_now, 'sending')
  RETURNING id INTO v_log_id;

  RETURN QUERY SELECT true, v_log_id, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_auto_reminder(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_auto_reminder(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_auto_reminder(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_reminder(UUID, INTEGER) TO service_role;
