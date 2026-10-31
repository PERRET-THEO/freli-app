-- Lot A perfs : index FK chauds, RLS initplan, agency_members SELECT unique,
-- project_derived_statuses set-based (source unique), list_clients délègue.

-- ---------------------------------------------------------------------------
-- 1. Index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_projects_agency_created
  ON public.projects (agency_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_client_created
  ON public.projects (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clients_agency_created
  ON public.clients (agency_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agencies_user_id
  ON public.agencies (user_id);

-- agency_members(user_id), project_reminder_logs(project_id, sent_at),
-- smart_reminders(project_id) : déjà présents.

-- ---------------------------------------------------------------------------
-- 2. user_agency_ids / is_agency_owner : (select auth.uid())
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_agency_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT agency_id FROM agency_members WHERE user_id = (SELECT auth.uid())
  UNION
  SELECT id FROM agencies WHERE user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_agency_owner(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agency_members
    WHERE agency_id = target_agency_id
      AND user_id = (SELECT auth.uid())
      AND role = 'owner'
  )
  OR EXISTS (
    SELECT 1 FROM agencies
    WHERE id = target_agency_id
      AND user_id = (SELECT auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Fix auth_rls_initplan (7 policies)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users manage own integrations" ON public.integrations;
CREATE POLICY "Users manage own integrations"
  ON public.integrations FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users read own webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Users read own webhook deliveries"
  ON public.webhook_deliveries FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users create own agency" ON public.agencies;
CREATE POLICY "Users create own agency"
  ON public.agencies FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Agency reads own extraction audit logs" ON public.extraction_audit_logs;
CREATE POLICY "Agency reads own extraction audit logs"
  ON public.extraction_audit_logs FOR SELECT
  TO authenticated
  USING (
    extraction_id IN (
      SELECT edd.id
      FROM public.extracted_document_data edd
      WHERE edd.agency_id IN (SELECT public.user_agency_ids())
    )
  );

DROP POLICY IF EXISTS "Agency reads own email events" ON public.email_events;
CREATE POLICY "Agency reads own email events"
  ON public.email_events FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      WHERE p.agency_id IN (SELECT public.user_agency_ids())
    )
  );

DROP POLICY IF EXISTS "Agency manages own document models" ON public.agency_document_models;
CREATE POLICY "Agency manages own document models"
  ON public.agency_document_models FOR ALL
  TO authenticated
  USING (agency_id IN (SELECT public.user_agency_ids()))
  WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));

DROP POLICY IF EXISTS "billing_accounts_select_member" ON public.billing_accounts;
CREATE POLICY "billing_accounts_select_member"
  ON public.billing_accounts FOR SELECT
  TO authenticated
  USING (agency_id IN (SELECT public.user_agency_ids()));

-- ---------------------------------------------------------------------------
-- 4. agency_members : une seule policy SELECT permissive
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members read agency roster" ON public.agency_members;
DROP POLICY IF EXISTS "Owners manage agency roster" ON public.agency_members;

CREATE POLICY "Members read agency roster"
  ON public.agency_members FOR SELECT
  TO authenticated
  USING (agency_id IN (SELECT public.user_agency_ids()));

CREATE POLICY "Owners insert agency roster"
  ON public.agency_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_agency_owner(agency_id));

CREATE POLICY "Owners update agency roster"
  ON public.agency_members FOR UPDATE
  TO authenticated
  USING (public.is_agency_owner(agency_id))
  WITH CHECK (public.is_agency_owner(agency_id));

CREATE POLICY "Owners delete agency roster"
  ON public.agency_members FOR DELETE
  TO authenticated
  USING (public.is_agency_owner(agency_id));

-- ---------------------------------------------------------------------------
-- 5. project_derived_statuses — set-based (source unique)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_derived_statuses(p_project_ids uuid[])
RETURNS TABLE (project_id uuid, derived_status text, unreachable boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH input_ids AS (
    SELECT DISTINCT x AS id
    FROM unnest(COALESCE(p_project_ids, ARRAY[]::uuid[])) AS x
  ),
  allowed AS (
    SELECT p.*
    FROM public.projects p
    INNER JOIN input_ids i ON i.id = p.id
    WHERE (SELECT auth.uid()) IS NULL
       OR p.agency_id IN (SELECT public.user_agency_ids())
  ),
  checklist_stats AS (
    SELECT
      ci.project_id,
      count(*)::integer AS item_count,
      bool_or(
        COALESCE(ci.completed, false) = true
        AND COALESCE(ci.review_status, 'pending') = 'pending'
        AND ci.type IS DISTINCT FROM 'signature'
        AND ci.type IS DISTINCT FROM 'payment'
      ) AS has_agency_review,
      bool_or(
        COALESCE(ci.review_status, 'pending') = 'rejected'
        OR COALESCE(ci.completed, false) = false
      ) AS has_client_pending,
      max(ci.submitted_at) AS max_submitted_at
    FROM public.checklist_items ci
    WHERE ci.project_id IN (SELECT id FROM allowed)
    GROUP BY ci.project_id
  ),
  agency_settings AS (
    SELECT
      a.id,
      GREATEST(COALESCE(a.ai_reminder_max_per_project, 3), 1) AS max_reminders,
      CASE
        WHEN COALESCE(a.auto_reminders_delay_hours, 48) < 12 THEN 48
        ELSE COALESCE(a.auto_reminders_delay_hours, 48)
      END AS delay_hours
    FROM public.agencies a
    WHERE a.id IN (SELECT DISTINCT agency_id FROM allowed)
  ),
  anchors AS (
    SELECT
      p.id AS project_id,
      (
        SELECT max(v)
        FROM (VALUES
          (cs.max_submitted_at),
          (p.last_portal_visit_at),
          (p.reminder_cap_reset_at)
        ) AS t(v)
      ) AS cap_anchor,
      -- Aligné sur project_client_last_activity (max, sans invite_sent_at).
      (
        SELECT max(v)
        FROM (VALUES
          (cs.max_submitted_at),
          (p.last_portal_visit_at),
          (p.reminder_cap_reset_at),
          (p.created_at)
        ) AS t(v)
      ) AS last_activity
    FROM allowed p
    LEFT JOIN checklist_stats cs ON cs.project_id = p.id
  ),
  consecutive AS (
    SELECT
      a.project_id,
      count(l.id)::integer AS consecutive_auto
    FROM anchors a
    LEFT JOIN public.project_reminder_logs l
      ON l.project_id = a.project_id
     AND l.source = 'auto'
     AND l.status IN ('sent', 'sending')
     AND (a.cap_anchor IS NULL OR l.sent_at > a.cap_anchor)
    GROUP BY a.project_id
  ),
  enriched AS (
    SELECT
      p.id,
      p.status,
      p.invite_status,
      p.payment_status,
      p.created_at,
      COALESCE(cs.item_count, 0) AS item_count,
      COALESCE(cs.has_agency_review, false) AS has_agency_review,
      COALESCE(cs.has_client_pending, false) AS has_client_pending,
      COALESCE(c.consecutive_auto, 0) AS consecutive_auto,
      COALESCE(ag.max_reminders, 3) AS max_reminders,
      COALESCE(ag.delay_hours, 48) AS delay_hours,
      an.last_activity,
      (
        p.status IS DISTINCT FROM 'completed'
        AND COALESCE(c.consecutive_auto, 0) >= COALESCE(ag.max_reminders, 3)
      ) AS unreachable
    FROM allowed p
    LEFT JOIN checklist_stats cs ON cs.project_id = p.id
    LEFT JOIN consecutive c ON c.project_id = p.id
    LEFT JOIN anchors an ON an.project_id = p.id
    LEFT JOIN agency_settings ag ON ag.id = p.agency_id
  )
  SELECT
    e.id AS project_id,
    CASE
      WHEN e.status = 'completed' THEN 'completed'
      WHEN e.invite_status = 'pending'
        AND e.created_at > (now() - interval '10 minutes') THEN 'draft'
      WHEN e.item_count = 0 THEN 'action_required'
      WHEN e.has_agency_review
        OR e.invite_status = 'failed'
        OR e.invite_status = 'pending'
        OR COALESCE(e.payment_status, '') = 'failed'
        OR e.unreachable
      THEN 'action_required'
      WHEN e.has_client_pending
        AND e.last_activity IS NOT NULL
        AND e.last_activity <= (now() - make_interval(hours => e.delay_hours))
      THEN 'stalled'
      ELSE 'waiting_client'
    END AS derived_status,
    e.unreachable
  FROM enriched e;
$$;

COMMENT ON FUNCTION public.project_derived_statuses(uuid[]) IS
  'Source unique set-based des statuts UI + unreachable. Appelée par list_clients, dashboard, project_derived_status(id).';

-- Scalar : délègue au batch
CREATE OR REPLACE FUNCTION public.project_derived_status(p_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ds.derived_status
  FROM public.project_derived_statuses(ARRAY[p_project_id]) AS ds
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.project_derived_status(uuid) IS
  'Wrapper scalaire — délègue à project_derived_statuses(uuid[]).';

-- Unreachable : même source
CREATE OR REPLACE FUNCTION public.project_is_client_unreachable(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ds.unreachable
      FROM public.project_derived_statuses(ARRAY[p_project_id]) AS ds
      LIMIT 1
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. list_clients : appelle project_derived_statuses une fois
-- ---------------------------------------------------------------------------
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
  WITH agency_projects AS (
    SELECT p.id, p.client_id, p.token, p.created_at,
           p.last_portal_visit_at, p.reminder_cap_reset_at
    FROM public.projects p
    WHERE p.agency_id = p_agency_id
      AND p.client_id IS NOT NULL
  ),
  status_rows AS (
    SELECT ds.project_id, ds.derived_status
    FROM public.project_derived_statuses(
      COALESCE((SELECT array_agg(ap.id) FROM agency_projects ap), ARRAY[]::uuid[])
    ) AS ds
  ),
  checklist_max AS (
    SELECT ci.project_id, max(ci.submitted_at) AS max_submitted_at
    FROM public.checklist_items ci
    WHERE ci.project_id IN (SELECT ap.id FROM agency_projects ap)
    GROUP BY ci.project_id
  ),
  ranked_projects AS (
    SELECT
      ap.client_id,
      ap.id AS project_id,
      ap.token,
      ap.created_at,
      sr.derived_status,
      public.client_project_attention_rank_from_status(sr.derived_status) AS attention_rank,
      (
        SELECT max(v)
        FROM (VALUES
          (cm.max_submitted_at),
          (ap.last_portal_visit_at),
          (ap.reminder_cap_reset_at),
          (ap.created_at)
        ) AS t(v)
      ) AS activity_at
    FROM agency_projects ap
    INNER JOIN status_rows sr ON sr.project_id = ap.id
    LEFT JOIN checklist_max cm ON cm.project_id = ap.id
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
    FROM public.clients c
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

REVOKE ALL ON FUNCTION public.project_derived_statuses(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_derived_statuses(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_derived_statuses(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_derived_statuses(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.project_derived_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_derived_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_derived_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_derived_status(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.project_is_client_unreachable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_is_client_unreachable(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_is_client_unreachable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_is_client_unreachable(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.list_clients(uuid, text, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_clients(uuid, text, text, text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_clients(uuid, text, text, text, text, int, int) TO service_role;
