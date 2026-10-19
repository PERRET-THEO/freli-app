-- Statut projet dérivé unique (dashboard + list_clients).
-- Backfill invite_status (pré-prompt 2), helpers plafond/injoignable,
-- project_derived_status SECURITY INVOKER STABLE, index checklist.

-- ---------------------------------------------------------------------------
-- 1. Backfill : avant invite_status, l'invitation partait de façon synchrone.
-- ---------------------------------------------------------------------------
UPDATE public.projects
SET
  invite_status = 'sent',
  invite_sent_at = COALESCE(invite_sent_at, created_at)
WHERE invite_status IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Index pour les lookups revue / pending
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_checklist_items_project_completed_review
  ON public.checklist_items (project_id, completed, review_status);

-- ---------------------------------------------------------------------------
-- 3. Ancre plafond (même sémantique que claim_auto_reminder)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_reminder_cap_anchor(p_project_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_anchor timestamptz;
  v_max_submitted timestamptz;
  v_portal timestamptz;
  v_reset timestamptz;
BEGIN
  SELECT max(ci.submitted_at) INTO v_max_submitted
  FROM public.checklist_items ci WHERE ci.project_id = p_project_id;

  SELECT p.last_portal_visit_at, p.reminder_cap_reset_at
  INTO v_portal, v_reset
  FROM public.projects p WHERE p.id = p_project_id;

  v_anchor := v_max_submitted;
  IF v_portal IS NOT NULL AND (v_anchor IS NULL OR v_portal > v_anchor) THEN
    v_anchor := v_portal;
  END IF;
  IF v_reset IS NOT NULL AND (v_anchor IS NULL OR v_reset > v_anchor) THEN
    v_anchor := v_reset;
  END IF;
  RETURN v_anchor;
END;
$$;

COMMENT ON FUNCTION public.project_reminder_cap_anchor(uuid) IS
  'Ancre du plafond de relances auto : max(submitted_at, last_portal_visit_at, reminder_cap_reset_at).';

-- ---------------------------------------------------------------------------
-- 4. Compteur de relances auto consécutives depuis l'ancre (prompt 4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_consecutive_auto_reminders(p_project_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.project_reminder_logs l
  WHERE l.project_id = p_project_id
    AND l.source = 'auto'
    AND l.status IN ('sent', 'sending')
    AND (
      public.project_reminder_cap_anchor(p_project_id) IS NULL
      OR l.sent_at > public.project_reminder_cap_anchor(p_project_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- 5. Client injoignable = plafond atteint (réutilise le compteur ci-dessus)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_is_client_unreachable(p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_status text;
  v_max integer;
  v_consecutive integer;
BEGIN
  SELECT p.agency_id, p.status
  INTO v_agency_id, v_status
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF NOT FOUND OR v_status = 'completed' THEN
    RETURN false;
  END IF;

  SELECT COALESCE(a.ai_reminder_max_per_project, 3)
  INTO v_max
  FROM public.agencies a
  WHERE a.id = v_agency_id;

  IF v_max IS NULL OR v_max < 1 THEN
    v_max := 3;
  END IF;

  v_consecutive := public.project_consecutive_auto_reminders(p_project_id);
  RETURN v_consecutive >= v_max;
END;
$$;

COMMENT ON FUNCTION public.project_is_client_unreachable(uuid) IS
  'True si relances auto consécutives depuis la dernière activité client ≥ plafond agence.';

-- Refactor claim_auto_reminder pour appeler le même compteur (évite double logique).
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

  -- Même compteur que project_is_client_unreachable / project_consecutive_auto_reminders.
  v_consecutive := public.project_consecutive_auto_reminders(p_project_id);
  IF v_consecutive >= v_max THEN
    RETURN QUERY SELECT false, NULL::uuid, 'cap_reached';
    RETURN;
  END IF;

  SELECT max(ci.submitted_at)
  INTO v_max_submitted
  FROM checklist_items ci
  WHERE ci.project_id = p_project_id;

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

-- ---------------------------------------------------------------------------
-- 6. Dernière activité client (ancre stalled) — COALESCE explicite
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_client_last_activity(p_project_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT max(ci.submitted_at) FROM public.checklist_items ci WHERE ci.project_id = p_project_id),
    (SELECT p.last_portal_visit_at FROM public.projects p WHERE p.id = p_project_id),
    (SELECT p.reminder_cap_reset_at FROM public.projects p WHERE p.id = p_project_id),
    (SELECT p.invite_sent_at FROM public.projects p WHERE p.id = p_project_id),
    (SELECT p.created_at FROM public.projects p WHERE p.id = p_project_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. Actions client restantes (équivalent getClientPendingActions, sans visibleWhen)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_has_client_pending_actions(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.checklist_items ci
    WHERE ci.project_id = p_project_id
      AND (
        COALESCE(ci.review_status, 'pending') = 'rejected'
        OR COALESCE(ci.completed, false) = false
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. project_derived_status — source unique
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_derived_status(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_project RECORD;
  v_delay_hours integer;
  v_last_activity timestamptz;
  v_has_agency_review boolean;
  v_has_client_pending boolean;
BEGIN
  SELECT
    p.id,
    p.status,
    p.invite_status,
    p.payment_status,
    p.created_at,
    p.agency_id
  INTO v_project
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Accès : membre de l'agence uniquement (SECURITY INVOKER + garde explicite).
  IF auth.uid() IS NOT NULL
     AND v_project.agency_id NOT IN (SELECT public.user_agency_ids()) THEN
    RETURN NULL;
  END IF;

  IF v_project.status = 'completed' THEN
    RETURN 'completed';
  END IF;

  IF v_project.invite_status = 'pending'
     AND v_project.created_at > (now() - interval '10 minutes') THEN
    RETURN 'draft';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.checklist_items ci
    WHERE ci.project_id = p_project_id
      AND COALESCE(ci.completed, false) = true
      AND COALESCE(ci.review_status, 'pending') = 'pending'
      AND ci.type IS DISTINCT FROM 'signature'
      AND ci.type IS DISTINCT FROM 'payment'
  )
  INTO v_has_agency_review;

  IF v_has_agency_review
     OR v_project.invite_status = 'failed'
     OR v_project.invite_status = 'pending'
     OR COALESCE(v_project.payment_status, '') = 'failed'
     OR public.project_is_client_unreachable(p_project_id) THEN
    RETURN 'action_required';
  END IF;

  v_has_client_pending := public.project_has_client_pending_actions(p_project_id);

  IF v_has_client_pending THEN
    SELECT COALESCE(a.auto_reminders_delay_hours, 48)
    INTO v_delay_hours
    FROM public.agencies a
    WHERE a.id = v_project.agency_id;

    IF v_delay_hours IS NULL OR v_delay_hours < 12 THEN
      v_delay_hours := 48;
    END IF;

    v_last_activity := public.project_client_last_activity(p_project_id);

    IF v_last_activity IS NOT NULL
       AND v_last_activity <= (now() - make_interval(hours => v_delay_hours)) THEN
      RETURN 'stalled';
    END IF;

    RETURN 'waiting_client';
  END IF;

  RETURN 'waiting_client';
END;
$$;

COMMENT ON FUNCTION public.project_derived_status(uuid) IS
  'Statut UI exclusif : completed|draft|action_required|stalled|waiting_client. SECURITY INVOKER.';

REVOKE ALL ON FUNCTION public.project_reminder_cap_anchor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_reminder_cap_anchor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_reminder_cap_anchor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_reminder_cap_anchor(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.project_consecutive_auto_reminders(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_consecutive_auto_reminders(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_consecutive_auto_reminders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_consecutive_auto_reminders(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.project_is_client_unreachable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_is_client_unreachable(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_is_client_unreachable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_is_client_unreachable(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.project_client_last_activity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_client_last_activity(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_client_last_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_client_last_activity(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.project_has_client_pending_actions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_has_client_pending_actions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_has_client_pending_actions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_has_client_pending_actions(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.project_derived_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_derived_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_derived_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_derived_status(uuid) TO service_role;

-- Batch helper pour le dashboard (évite N+1).
-- Signature définitive (unreachable) dans 202610191020_* si appliquée après coup.
CREATE OR REPLACE FUNCTION public.project_derived_statuses(p_project_ids uuid[])
RETURNS TABLE (project_id uuid, derived_status text, unreachable boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    public.project_derived_status(p.id),
    public.project_is_client_unreachable(p.id)
  FROM public.projects p
  WHERE p.id = ANY(p_project_ids);
$$;

REVOKE ALL ON FUNCTION public.project_derived_statuses(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_derived_statuses(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_derived_statuses(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_derived_statuses(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. list_clients : utilise project_derived_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_project_attention_rank_from_status(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'action_required' THEN 1
    WHEN 'stalled' THEN 2
    WHEN 'waiting_client' THEN 3
    WHEN 'draft' THEN 4
    WHEN 'completed' THEN 5
    ELSE 6
  END;
$$;

CREATE OR REPLACE FUNCTION public.list_clients(
  p_agency_id uuid,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_sort text DEFAULT 'created_at',
  p_dir text DEFAULT 'desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  company_name text,
  industry text,
  created_at timestamptz,
  project_count bigint,
  attention_status text,
  last_activity_at timestamptz,
  portal_token text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_status text := NULLIF(trim(COALESCE(p_status, '')), '');
  v_sort text := COALESCE(NULLIF(trim(p_sort), ''), 'created_at');
  v_dir text := lower(COALESCE(NULLIF(trim(p_dir), ''), 'desc'));
BEGIN
  IF p_agency_id IS NULL OR p_agency_id NOT IN (SELECT public.user_agency_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_dir NOT IN ('asc', 'desc') THEN
    v_dir := 'desc';
  END IF;

  IF v_sort NOT IN ('name', 'created_at', 'project_count', 'last_activity', 'attention') THEN
    v_sort := 'created_at';
  END IF;

  -- Aliases legacy + nouveaux tokens.
  IF v_status IS NOT NULL THEN
    v_status := CASE v_status
      WHEN 'action' THEN 'action_required'
      WHEN 'waiting' THEN 'waiting_client'
      WHEN 'blocked' THEN 'stalled'
      WHEN 'done' THEN 'completed'
      WHEN 'in_progress' THEN 'waiting_client'
      ELSE v_status
    END;
  END IF;

  IF v_status IS NOT NULL AND v_status NOT IN (
    'action_required', 'waiting_client', 'stalled', 'completed', 'draft', 'none', 'all'
  ) THEN
    v_status := NULL;
  END IF;
  IF v_status = 'all' THEN
    v_status := NULL;
  END IF;

  RETURN QUERY
  WITH ranked_projects AS (
    SELECT
      p.client_id,
      p.id AS project_id,
      p.token,
      p.created_at,
      public.project_derived_status(p.id) AS derived_status,
      public.client_project_attention_rank_from_status(
        public.project_derived_status(p.id)
      ) AS attention_rank,
      public.project_client_last_activity(p.id) AS activity_at
    FROM projects p
    WHERE p.agency_id = p_agency_id
      AND p.client_id IS NOT NULL
  ),
  client_agg AS (
    SELECT
      c.id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.company_name,
      c.industry,
      c.created_at,
      count(rp.project_id)::bigint AS project_count,
      COALESCE(min(rp.attention_rank), 6) AS best_rank,
      max(rp.activity_at) AS last_activity_at,
      (
        SELECT rp2.token
        FROM ranked_projects rp2
        WHERE rp2.client_id = c.id
        ORDER BY rp2.created_at DESC NULLS LAST
        LIMIT 1
      ) AS portal_token
    FROM clients c
    LEFT JOIN ranked_projects rp ON rp.client_id = c.id
    WHERE c.agency_id = p_agency_id
      AND (
        v_search IS NULL
        OR public.f_unaccent(lower(
             coalesce(c.first_name, '') || ' ' ||
             coalesce(c.last_name, '') || ' ' ||
             coalesce(c.email, '') || ' ' ||
             coalesce(c.company_name, '')
           ))
           ILIKE '%' || public.f_unaccent(lower(v_search)) || '%'
      )
    GROUP BY c.id
  ),
  labeled AS (
    SELECT
      ca.*,
      CASE
        WHEN ca.project_count = 0 THEN 'none'
        ELSE CASE ca.best_rank
          WHEN 1 THEN 'action_required'
          WHEN 2 THEN 'stalled'
          WHEN 3 THEN 'waiting_client'
          WHEN 4 THEN 'draft'
          WHEN 5 THEN 'completed'
          ELSE 'none'
        END
      END AS attention_status
    FROM client_agg ca
  ),
  filtered AS (
    SELECT l.*
    FROM labeled l
    WHERE v_status IS NULL OR l.attention_status = v_status
  ),
  counted AS (
    SELECT f.*, (SELECT count(*) FROM filtered)::bigint AS total_count
    FROM filtered f
  )
  SELECT
    ct.id,
    ct.first_name,
    ct.last_name,
    ct.email,
    ct.phone,
    ct.company_name,
    ct.industry,
    ct.created_at,
    ct.project_count,
    ct.attention_status,
    COALESCE(ct.last_activity_at, ct.created_at) AS last_activity_at,
    ct.portal_token,
    ct.total_count
  FROM counted ct
  ORDER BY
    CASE WHEN v_sort = 'name' AND v_dir = 'asc' THEN lower(ct.first_name || ' ' || ct.last_name) END ASC NULLS LAST,
    CASE WHEN v_sort = 'name' AND v_dir = 'desc' THEN lower(ct.first_name || ' ' || ct.last_name) END DESC NULLS LAST,
    CASE WHEN v_sort = 'project_count' AND v_dir = 'asc' THEN ct.project_count END ASC NULLS LAST,
    CASE WHEN v_sort = 'project_count' AND v_dir = 'desc' THEN ct.project_count END DESC NULLS LAST,
    CASE WHEN v_sort = 'last_activity' AND v_dir = 'asc' THEN ct.last_activity_at END ASC NULLS LAST,
    CASE WHEN v_sort = 'last_activity' AND v_dir = 'desc' THEN ct.last_activity_at END DESC NULLS LAST,
    CASE WHEN v_sort = 'attention' AND v_dir = 'asc' THEN ct.best_rank END ASC NULLS LAST,
    CASE WHEN v_sort = 'attention' AND v_dir = 'desc' THEN ct.best_rank END DESC NULLS LAST,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN ct.created_at END ASC NULLS LAST,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN ct.created_at END DESC NULLS LAST,
    ct.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.list_clients(uuid, text, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_clients(uuid, text, text, text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_clients(uuid, text, text, text, text, int, int) TO service_role;

REVOKE ALL ON FUNCTION public.client_project_attention_rank_from_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_project_attention_rank_from_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_project_attention_rank_from_status(text) TO service_role;
