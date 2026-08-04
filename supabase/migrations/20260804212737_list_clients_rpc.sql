-- Extensions + immutable unaccent helper + paginated list_clients RPC.
-- Signature includes limit/offset/search/status/sort/dir from day one (Lot B).

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = public, extensions
AS $$
  SELECT unaccent($1)
$$;

CREATE OR REPLACE FUNCTION public.client_project_attention_rank(
  p_status text,
  p_created_at timestamptz,
  p_last_reminder_sent_at timestamptz,
  p_blocking_owner text,
  p_blocking_since timestamptz
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_status = 'completed' THEN 5
    WHEN p_blocking_owner IS NOT NULL
      AND p_blocking_since IS NOT NULL
      AND p_blocking_since <= (now() - interval '48 hours') THEN 1
    WHEN p_blocking_owner = 'agency' THEN 2
    WHEN p_status <> 'completed'
      AND p_created_at <= (now() - interval '48 hours')
      AND (
        p_last_reminder_sent_at IS NULL
        OR p_last_reminder_sent_at <= (now() - interval '72 hours')
      ) THEN 2
    WHEN p_status <> 'completed' THEN 3
    ELSE 5
  END;
$$;

CREATE OR REPLACE FUNCTION public.client_project_attention_token(p_rank integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_rank
    WHEN 1 THEN 'blocked'
    WHEN 2 THEN 'action'
    WHEN 3 THEN 'waiting'
    WHEN 4 THEN 'in_progress'
    WHEN 5 THEN 'done'
    ELSE 'none'
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

  IF v_status IS NOT NULL AND v_status NOT IN ('action', 'waiting', 'blocked', 'done', 'none', 'all') THEN
    v_status := NULL;
  END IF;
  IF v_status = 'all' THEN
    v_status := NULL;
  END IF;

  RETURN QUERY
  WITH project_signals AS (
    SELECT
      p.client_id,
      p.id AS project_id,
      p.token,
      p.status,
      p.created_at,
      p.last_reminder_sent_at,
      (
        SELECT ci.review_status
        FROM checklist_items ci
        WHERE ci.project_id = p.id
          AND ci.review_status = 'pending'
          AND ci.submitted_at IS NOT NULL
          AND COALESCE(ci.completed, false) = true
        ORDER BY ci.order_index
        LIMIT 1
      ) AS pending_review,
      (
        SELECT ci.submitted_at
        FROM checklist_items ci
        WHERE ci.project_id = p.id
          AND ci.review_status = 'pending'
          AND ci.submitted_at IS NOT NULL
          AND COALESCE(ci.completed, false) = true
        ORDER BY ci.order_index
        LIMIT 1
      ) AS pending_review_since,
      (
        SELECT ci.label
        FROM checklist_items ci
        WHERE ci.project_id = p.id
          AND COALESCE(ci.completed, false) = false
        ORDER BY ci.order_index
        LIMIT 1
      ) AS first_incomplete_label,
      (
        SELECT COALESCE(
          (
            SELECT prev.submitted_at
            FROM checklist_items prev
            WHERE prev.project_id = p.id
              AND prev.order_index < ci.order_index
              AND COALESCE(prev.completed, false) = true
            ORDER BY prev.order_index DESC
            LIMIT 1
          ),
          p.created_at
        )
        FROM checklist_items ci
        WHERE ci.project_id = p.id
          AND COALESCE(ci.completed, false) = false
        ORDER BY ci.order_index
        LIMIT 1
      ) AS incomplete_since
    FROM projects p
    WHERE p.agency_id = p_agency_id
      AND p.client_id IS NOT NULL
  ),
  ranked_projects AS (
    SELECT
      ps.*,
      public.client_project_attention_rank(
        ps.status,
        ps.created_at,
        ps.last_reminder_sent_at,
        CASE
          WHEN ps.pending_review IS NOT NULL THEN 'agency'
          WHEN ps.first_incomplete_label IS NOT NULL THEN 'client'
          ELSE NULL
        END,
        CASE
          WHEN ps.pending_review IS NOT NULL THEN ps.pending_review_since
          WHEN ps.first_incomplete_label IS NOT NULL THEN ps.incomplete_since
          ELSE NULL
        END
      ) AS attention_rank,
      GREATEST(
        ps.created_at,
        COALESCE(ps.last_reminder_sent_at, ps.created_at),
        COALESCE(ps.pending_review_since, ps.created_at),
        COALESCE(ps.incomplete_since, ps.created_at)
      ) AS activity_at
    FROM project_signals ps
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
        ELSE public.client_project_attention_token(ca.best_rank::integer)
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

REVOKE ALL ON FUNCTION public.client_project_attention_rank(text, timestamptz, timestamptz, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_project_attention_rank(text, timestamptz, timestamptz, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_project_attention_rank(text, timestamptz, timestamptz, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.client_project_attention_token(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_project_attention_token(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_project_attention_token(integer) TO service_role;

REVOKE ALL ON FUNCTION public.f_unaccent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.f_unaccent(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.f_unaccent(text) TO service_role;
