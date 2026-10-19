-- Renvoi manuel d'invitation : claim atomique + dernière activité client sans invite_sent_at.

-- ---------------------------------------------------------------------------
-- project_client_last_activity : ne pas traiter un renvoi d'invitation agence
-- comme une activité client (invite_sent_at exclu).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_client_last_activity(p_project_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT (
    SELECT max(v)
    FROM unnest(
      ARRAY[
        (SELECT max(ci.submitted_at) FROM public.checklist_items ci WHERE ci.project_id = p_project_id),
        (SELECT p.last_portal_visit_at FROM public.projects p WHERE p.id = p_project_id),
        (SELECT p.reminder_cap_reset_at FROM public.projects p WHERE p.id = p_project_id),
        (SELECT p.created_at FROM public.projects p WHERE p.id = p_project_id)
      ]
    ) AS v
  );
$$;

-- ---------------------------------------------------------------------------
-- claim_invite_manual_resend : cooldown atomique + plafond 5 / 24 h
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_invite_manual_resend(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project record;
  v_cooldown interval;
  v_count integer;
  v_oldest timestamptz;
  v_retry_ms bigint;
  v_updated uuid;
  v_now timestamptz := now();
BEGIN
  IF p_project_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_project');
  END IF;

  SELECT
    p.id,
    p.status,
    p.invite_status,
    p.invite_sent_at,
    p.invite_last_attempt_at,
    p.invite_attempts,
    p.client_id,
    p.agency_id,
    p.client_email
  INTO v_project
  FROM public.projects p
  WHERE p.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_project.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'completed', 'message', 'Ce projet est terminé.');
  END IF;

  -- Premier échec jamais envoyé : 30 s ; sinon 10 min.
  IF v_project.invite_status = 'failed' AND v_project.invite_sent_at IS NULL THEN
    v_cooldown := interval '30 seconds';
  ELSE
    v_cooldown := interval '10 minutes';
  END IF;

  -- Plafond 5 tentatives / 24 h (tous outcomes), uniquement si client_id (sinon cooldown seul).
  IF v_project.client_id IS NOT NULL THEN
    SELECT count(*)::integer, min(cae.occurred_at)
    INTO v_count, v_oldest
    FROM public.client_activity_events cae
    WHERE cae.project_id = p_project_id
      AND cae.event_type = 'invite.resent'
      AND cae.occurred_at > v_now - interval '24 hours';

    IF COALESCE(v_count, 0) >= 5 THEN
      v_retry_ms := GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM ((v_oldest + interval '24 hours') - v_now)) * 1000)
      )::bigint;
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'daily_cap',
        'message', 'Vous avez atteint la limite de 5 renvois sur 24 h.',
        'retry_after_ms', v_retry_ms
      );
    END IF;
  END IF;

  UPDATE public.projects
  SET
    invite_last_attempt_at = v_now,
    invite_status = 'pending',
    invite_error = NULL,
    invite_attempts = COALESCE(invite_attempts, 0) + 1
  WHERE id = p_project_id
    AND (
      invite_last_attempt_at IS NULL
      OR invite_last_attempt_at < v_now - v_cooldown
    )
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    v_retry_ms := GREATEST(
      0,
      FLOOR(
        EXTRACT(
          EPOCH FROM (
            (COALESCE(v_project.invite_last_attempt_at, v_now) + v_cooldown) - v_now
          )
        ) * 1000
      )
    )::bigint;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'rate_limited',
      'message', format(
        'Vous pourrez renvoyer l''invitation dans %s min.',
        GREATEST(1, CEIL(v_retry_ms / 60000.0)::int)
      ),
      'retry_after_ms', v_retry_ms
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'client_id', v_project.client_id,
    'agency_id', v_project.agency_id,
    'client_email', v_project.client_email,
    'invite_last_attempt_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invite_manual_resend(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_invite_manual_resend(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_invite_manual_resend(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invite_manual_resend(uuid) TO service_role;
