-- Drop legacy public policies that re-opened checklist_items to the world.
DROP POLICY IF EXISTS "Public read checklist" ON public.checklist_items;
DROP POLICY IF EXISTS "Public write checklist" ON public.checklist_items;
DROP POLICY IF EXISTS "Public read projects" ON public.projects;
DROP POLICY IF EXISTS "Public write projects" ON public.projects;

CREATE TABLE IF NOT EXISTS public.project_completion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (project_id)
);

ALTER TABLE public.project_completion_jobs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.portal_set_project_status(p_token text, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0001';
  END IF;

  IF p_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'status_forbidden' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.projects
  SET status = 'in_progress'
  WHERE token = p_token
    AND status IS DISTINCT FROM 'completed';

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE token = p_token) THEN
      RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_update_checklist_item(
  p_token text,
  p_item_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_item record;
  v_value text;
  v_completed boolean;
  v_prefix text;
  v_known_types text[] := ARRAY[
    'text', 'file', 'signature', 'email', 'phone', 'url', 'choice', 'payment', 'schedule', 'credentials'
  ];
  v_all_done boolean;
  v_any_done boolean;
  v_old_status text;
  v_new_status text;
  v_just_completed boolean := false;
  v_item_json jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0001';
  END IF;

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'invalid_item' USING ERRCODE = 'P0001';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id, p.status INTO v_project_id, v_old_status
  FROM public.projects p
  WHERE p.token = p_token
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT ci.id, ci.project_id, ci.type, ci.value, ci.completed
  INTO v_item
  FROM public.checklist_items ci
  WHERE ci.id = p_item_id
  LIMIT 1;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_item.project_id <> v_project_id THEN
    RAISE EXCEPTION 'forbidden_cross_project' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (v_item.type = ANY (v_known_types)) THEN
    RAISE EXCEPTION 'invalid_type' USING ERRCODE = 'P0001';
  END IF;

  IF v_item.type = 'credentials' THEN
    RAISE EXCEPTION 'credentials_via_rpc_forbidden' USING ERRCODE = 'P0001';
  END IF;

  IF p_payload ? 'review_status'
     AND COALESCE(p_payload->>'review_status', '') NOT IN ('', 'pending') THEN
    RAISE EXCEPTION 'review_status_forbidden' USING ERRCODE = 'P0001';
  END IF;

  IF p_payload ? 'type' OR p_payload ? 'project_id' OR p_payload ? 'order_index' THEN
    RAISE EXCEPTION 'immutable_fields' USING ERRCODE = 'P0001';
  END IF;

  v_value := COALESCE(p_payload->>'value', v_item.value);
  v_completed := COALESCE((p_payload->>'completed')::boolean, v_item.completed);

  IF v_item.type IN ('file', 'signature')
     AND v_value IS NOT NULL
     AND btrim(v_value) <> ''
     AND v_value !~ '^https?://' THEN
    v_prefix := v_project_id::text || '/' || p_item_id::text || '/';
    IF left(v_value, length(v_prefix)) <> v_prefix THEN
      RAISE EXCEPTION 'invalid_storage_path' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.checklist_items ci
  SET
    value = v_value,
    completed = v_completed,
    review_status = CASE
      WHEN v_completed THEN 'pending'
      ELSE ci.review_status
    END,
    review_note = CASE
      WHEN v_completed THEN NULL
      ELSE ci.review_note
    END,
    submitted_at = CASE
      WHEN v_completed THEN COALESCE(
        NULLIF(p_payload->>'submitted_at', '')::timestamptz,
        now()
      )
      ELSE ci.submitted_at
    END
  WHERE ci.id = p_item_id;

  SELECT
    bool_and(ci.completed)
      AND bool_and(COALESCE(ci.review_status, 'pending') IS DISTINCT FROM 'rejected'),
    bool_or(ci.completed)
  INTO v_all_done, v_any_done
  FROM public.checklist_items ci
  WHERE ci.project_id = v_project_id;

  IF v_all_done AND EXISTS (SELECT 1 FROM public.checklist_items WHERE project_id = v_project_id) THEN
    v_new_status := 'completed';
  ELSIF v_any_done THEN
    v_new_status := 'in_progress';
  ELSE
    v_new_status := COALESCE(v_old_status, 'pending');
  END IF;

  IF v_new_status = 'completed' AND v_old_status IS DISTINCT FROM 'completed' THEN
    UPDATE public.projects SET status = 'completed' WHERE id = v_project_id;
    v_just_completed := true;
    INSERT INTO public.project_completion_jobs (project_id, token)
    VALUES (v_project_id, p_token)
    ON CONFLICT (project_id) DO NOTHING;
  ELSIF v_new_status = 'in_progress' AND v_old_status IS DISTINCT FROM 'completed' THEN
    UPDATE public.projects
    SET status = 'in_progress'
    WHERE id = v_project_id AND status IS DISTINCT FROM 'completed';
  END IF;

  SELECT jsonb_build_object(
    'id', ci.id,
    'label', ci.label,
    'type', ci.type,
    'completed', ci.completed,
    'value', ci.value,
    'order_index', ci.order_index,
    'review_status', ci.review_status,
    'review_note', ci.review_note,
    'config', ci.config
  )
  INTO v_item_json
  FROM public.checklist_items ci
  WHERE ci.id = p_item_id;

  RETURN jsonb_build_object(
    'item', v_item_json,
    'project_status', (SELECT status FROM public.projects WHERE id = v_project_id),
    'project_just_completed', v_just_completed
  );
END;
$$;
