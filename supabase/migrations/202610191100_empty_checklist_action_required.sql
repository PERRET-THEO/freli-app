-- Checklist vide → action_required ; création projet sans étape refusée.

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
  v_item_count integer;
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

  SELECT count(*)::integer
  INTO v_item_count
  FROM public.checklist_items ci
  WHERE ci.project_id = p_project_id;

  -- Aucune étape : l'agence doit corriger la checklist (pas « en attente client »).
  IF v_item_count = 0 THEN
    RETURN 'action_required';
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

-- Garde serveur : pas de projet sans checklist (le IF optionnel précédent le permettait).
CREATE OR REPLACE FUNCTION public.create_project_with_client(
  p_mode text,
  p_client_id uuid,
  p_client jsonb,
  p_project jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_client_id uuid;
  v_email text;
  v_existing_id uuid;
  v_project_id uuid;
  v_token text;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_key text;
  v_val text;
  v_update jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_mode NOT IN ('attach', 'update', 'create') THEN
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = 'P0001';
  END IF;

  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'checklist_empty' USING ERRCODE = 'P0001';
  END IF;

  v_agency_id := (p_project ->> 'agency_id')::uuid;
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'agency_required' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_agency_ids() ids WHERE ids = v_agency_id
  ) THEN
    RAISE EXCEPTION 'forbidden_agency' USING ERRCODE = 'P0001';
  END IF;

  v_email := lower(trim(coalesce(p_client ->> 'email', p_project ->> 'client_email', '')));
  IF v_email = '' THEN
    RAISE EXCEPTION 'email_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_mode = 'attach' THEN
    IF p_client_id IS NULL THEN
      RAISE EXCEPTION 'client_id_required' USING ERRCODE = 'P0001';
    END IF;
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE id = p_client_id AND agency_id = v_agency_id;
    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'client_not_found' USING ERRCODE = 'P0001';
    END IF;

  ELSIF p_mode = 'update' THEN
    IF p_client_id IS NULL THEN
      RAISE EXCEPTION 'client_id_required' USING ERRCODE = 'P0001';
    END IF;
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE id = p_client_id AND agency_id = v_agency_id;
    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'client_not_found' USING ERRCODE = 'P0001';
    END IF;

    FOR v_key, v_val IN
      SELECT key, value
      FROM jsonb_each_text(p_client)
      WHERE key NOT IN ('agency_id', 'id')
        AND value IS NOT NULL
        AND btrim(value) <> ''
        AND value <> 'null'
    LOOP
      v_update := v_update || jsonb_build_object(v_key, v_val);
    END LOOP;

    IF v_update <> '{}'::jsonb THEN
      UPDATE public.clients SET
        first_name = COALESCE(v_update ->> 'first_name', first_name),
        last_name = COALESCE(v_update ->> 'last_name', last_name),
        email = COALESCE(v_update ->> 'email', email),
        phone = COALESCE(v_update ->> 'phone', phone),
        company_name = COALESCE(v_update ->> 'company_name', company_name),
        company_type = COALESCE(v_update ->> 'company_type', company_type),
        siret = COALESCE(v_update ->> 'siret', siret),
        vat_number = COALESCE(v_update ->> 'vat_number', vat_number),
        siren = COALESCE(v_update ->> 'siren', siren),
        code_naf = COALESCE(v_update ->> 'code_naf', code_naf),
        source_donnees_legales = COALESCE(v_update ->> 'source_donnees_legales', source_donnees_legales),
        address_street = COALESCE(v_update ->> 'address_street', address_street),
        address_postal_code = COALESCE(v_update ->> 'address_postal_code', address_postal_code),
        address_city = COALESCE(v_update ->> 'address_city', address_city),
        address_country = COALESCE(v_update ->> 'address_country', address_country),
        website = COALESCE(v_update ->> 'website', website),
        industry = COALESCE(v_update ->> 'industry', industry),
        company_size = COALESCE(v_update ->> 'company_size', company_size),
        notes = COALESCE(v_update ->> 'notes', notes),
        updated_at = now()
      WHERE id = v_client_id;
    END IF;

  ELSE
    SELECT id INTO v_existing_id
    FROM public.clients
    WHERE agency_id = v_agency_id
      AND lower(trim(email)) = v_email
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'client_exists'
        USING ERRCODE = 'P0001', DETAIL = v_existing_id::text;
    END IF;

    INSERT INTO public.clients (
      agency_id, first_name, last_name, email, phone,
      company_name, company_type, siret, vat_number, siren, code_naf, source_donnees_legales,
      address_street, address_postal_code, address_city, address_country,
      website, industry, company_size, notes
    ) VALUES (
      v_agency_id,
      nullif(trim(p_client ->> 'first_name'), ''),
      nullif(trim(p_client ->> 'last_name'), ''),
      v_email,
      CASE WHEN p_client ? 'phone' AND jsonb_typeof(p_client -> 'phone') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'phone'), '') END,
      CASE WHEN p_client ? 'company_name' AND jsonb_typeof(p_client -> 'company_name') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'company_name'), '') END,
      CASE WHEN p_client ? 'company_type' AND jsonb_typeof(p_client -> 'company_type') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'company_type'), '') END,
      CASE WHEN p_client ? 'siret' AND jsonb_typeof(p_client -> 'siret') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'siret'), '') END,
      CASE WHEN p_client ? 'vat_number' AND jsonb_typeof(p_client -> 'vat_number') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'vat_number'), '') END,
      CASE WHEN p_client ? 'siren' AND jsonb_typeof(p_client -> 'siren') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'siren'), '') END,
      CASE WHEN p_client ? 'code_naf' AND jsonb_typeof(p_client -> 'code_naf') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'code_naf'), '') END,
      CASE WHEN p_client ? 'source_donnees_legales' AND jsonb_typeof(p_client -> 'source_donnees_legales') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'source_donnees_legales'), '') END,
      CASE WHEN p_client ? 'address_street' AND jsonb_typeof(p_client -> 'address_street') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'address_street'), '') END,
      CASE WHEN p_client ? 'address_postal_code' AND jsonb_typeof(p_client -> 'address_postal_code') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'address_postal_code'), '') END,
      CASE WHEN p_client ? 'address_city' AND jsonb_typeof(p_client -> 'address_city') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'address_city'), '') END,
      CASE
        WHEN p_client ? 'address_country' AND jsonb_typeof(p_client -> 'address_country') = 'null' THEN NULL
        WHEN NOT (p_client ? 'address_country') THEN NULL
        ELSE nullif(trim(p_client ->> 'address_country'), '')
      END,
      CASE WHEN p_client ? 'website' AND jsonb_typeof(p_client -> 'website') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'website'), '') END,
      CASE WHEN p_client ? 'industry' AND jsonb_typeof(p_client -> 'industry') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'industry'), '') END,
      CASE WHEN p_client ? 'company_size' AND jsonb_typeof(p_client -> 'company_size') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'company_size'), '') END,
      CASE WHEN p_client ? 'notes' AND jsonb_typeof(p_client -> 'notes') = 'null' THEN NULL
           ELSE nullif(trim(p_client ->> 'notes'), '') END
    )
    RETURNING id INTO v_client_id;
  END IF;

  v_token := coalesce(nullif(trim(p_project ->> 'token'), ''), gen_random_uuid()::text);

  INSERT INTO public.projects (
    agency_id, client_id, name, client_name, client_email, token, price,
    invite_status, invite_attempts
  ) VALUES (
    v_agency_id,
    v_client_id,
    nullif(trim(p_project ->> 'name'), ''),
    nullif(trim(p_project ->> 'client_name'), ''),
    v_email,
    v_token,
    CASE
      WHEN p_project ? 'price' AND jsonb_typeof(p_project -> 'price') = 'number'
        THEN (p_project ->> 'price')::numeric
      WHEN p_project ? 'price' AND nullif(trim(p_project ->> 'price'), '') IS NOT NULL
        THEN (p_project ->> 'price')::numeric
      ELSE NULL
    END,
    'pending',
    0
  )
  RETURNING id, token INTO v_project_id, v_token;

  WITH prepared AS (
    SELECT
      v_project_id AS project_id,
      coalesce(nullif(trim(elem ->> 'label'), ''), 'Étape') AS label,
      coalesce(nullif(trim(elem ->> 'type'), ''), 'text') AS type,
      coalesce((elem ->> 'required')::boolean, true) AS required,
      coalesce((elem ->> 'order_index')::int, (ord - 1)) AS order_index,
      coalesce((elem ->> 'completed')::boolean, false) AS completed,
      CASE
        WHEN elem ? 'contract_template_id'
          AND jsonb_typeof(elem -> 'contract_template_id') <> 'null'
          AND nullif(trim(elem ->> 'contract_template_id'), '') IS NOT NULL
        THEN (elem ->> 'contract_template_id')::uuid
        ELSE NULL
      END AS contract_template_id,
      elem ->> 'value' AS value,
      CASE
        WHEN elem ? 'config' AND jsonb_typeof(elem -> 'config') = 'object'
        THEN elem -> 'config'
        ELSE NULL
      END AS config
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord)
  ),
  inserted AS (
    INSERT INTO public.checklist_items (
      project_id, label, type, required, order_index, completed,
      contract_template_id, value, config
    )
    SELECT
      project_id, label, type, required, order_index, completed,
      contract_template_id, value, config
    FROM prepared
    ORDER BY order_index
    RETURNING id, order_index
  )
  SELECT coalesce(array_agg(id ORDER BY order_index), ARRAY[]::uuid[])
  INTO v_item_ids
  FROM inserted;

  RETURN jsonb_build_object(
    'project_id', v_project_id,
    'token', v_token,
    'client_id', v_client_id,
    'item_ids', to_jsonb(v_item_ids),
    'invite_status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_with_client(text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project_with_client(text, uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_with_client(text, uuid, jsonb, jsonb, jsonb) TO service_role;
