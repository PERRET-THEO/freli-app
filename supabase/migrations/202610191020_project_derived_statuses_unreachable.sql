DROP FUNCTION IF EXISTS public.project_derived_statuses(uuid[]);

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
