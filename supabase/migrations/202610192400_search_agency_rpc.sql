-- Palette ⌘K : recherche unifiée clients + projets (unaccent, SIRET sans espaces).
-- SECURITY INVOKER : RLS clients/projects inchangée via user_agency_ids().

CREATE OR REPLACE FUNCTION public.search_agency(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_raw text := nullif(trim(p_query), '');
  v_needle text;
  v_siret text;
BEGIN
  IF v_raw IS NULL OR char_length(v_raw) < 2 THEN
    RETURN jsonb_build_object('clients', '[]'::jsonb, 'projects', '[]'::jsonb);
  END IF;

  v_needle := public.f_unaccent(lower(v_raw));
  v_siret := regexp_replace(v_raw, '\s+', '', 'g');

  RETURN jsonb_build_object(
    'clients',
    COALESCE(
      (
        SELECT jsonb_agg(row_to_json(c)::jsonb)
        FROM (
          SELECT
            cl.id,
            cl.first_name,
            cl.last_name,
            cl.email,
            cl.company_name,
            cl.siret
          FROM public.clients cl
          WHERE cl.agency_id IN (SELECT public.user_agency_ids())
            AND (
              public.f_unaccent(lower(
                coalesce(cl.first_name, '') || ' ' ||
                coalesce(cl.last_name, '') || ' ' ||
                coalesce(cl.email, '') || ' ' ||
                coalesce(cl.company_name, '')
              )) ILIKE '%' || v_needle || '%'
              OR (
                char_length(v_siret) >= 2
                AND regexp_replace(coalesce(cl.siret, ''), '\s+', '', 'g')
                    ILIKE '%' || v_siret || '%'
              )
            )
          ORDER BY cl.company_name NULLS LAST, cl.last_name NULLS LAST
          LIMIT 8
        ) c
      ),
      '[]'::jsonb
    ),
    'projects',
    COALESCE(
      (
        SELECT jsonb_agg(row_to_json(p)::jsonb)
        FROM (
          SELECT
            pr.id,
            pr.name,
            pr.client_name
          FROM public.projects pr
          WHERE pr.agency_id IN (SELECT public.user_agency_ids())
            AND public.f_unaccent(lower(
              coalesce(pr.name, '') || ' ' || coalesce(pr.client_name, '')
            )) ILIKE '%' || v_needle || '%'
          ORDER BY pr.created_at DESC NULLS LAST
          LIMIT 8
        ) p
      ),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.search_agency(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_agency(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_agency(text) TO service_role;
