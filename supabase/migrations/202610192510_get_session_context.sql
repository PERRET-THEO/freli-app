-- Bootstrap session : une RPC pour agence + rôle + billing (évite 4–6 RTT séquentiels).

CREATE OR REPLACE FUNCTION public.get_session_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_agency_id uuid;
  v_agency_name text;
  v_logo_url text;
  v_role text;
  v_billing_status text;
  v_billing_has_row boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT am.agency_id, am.role
  INTO v_agency_id, v_role
  FROM public.agency_members am
  WHERE am.user_id = v_uid
  ORDER BY am.created_at ASC
  LIMIT 1;

  IF v_agency_id IS NULL THEN
    SELECT a.id, 'owner'
    INTO v_agency_id, v_role
    FROM public.agencies a
    WHERE a.user_id = v_uid
    LIMIT 1;
  END IF;

  IF v_agency_id IS NULL THEN
    RETURN jsonb_build_object(
      'agency_id', null,
      'agency_name', null,
      'logo_url', null,
      'role', null,
      'billing_status', null,
      'billing_has_row', false
    );
  END IF;

  SELECT a.name, a.logo_url
  INTO v_agency_name, v_logo_url
  FROM public.agencies a
  WHERE a.id = v_agency_id;

  v_billing_status := null;
  v_billing_has_row := false;
  SELECT ba.status
  INTO v_billing_status
  FROM public.billing_accounts ba
  WHERE ba.agency_id = v_agency_id
  LIMIT 1;
  IF FOUND THEN
    v_billing_has_row := true;
  ELSE
    v_billing_status := null;
  END IF;

  RETURN jsonb_build_object(
    'agency_id', v_agency_id,
    'agency_name', v_agency_name,
    'logo_url', v_logo_url,
    'role', v_role,
    'billing_status', v_billing_status,
    'billing_has_row', v_billing_has_row
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_context() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_session_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_context() TO service_role;
