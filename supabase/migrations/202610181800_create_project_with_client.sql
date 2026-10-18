-- projects.name + default trigger, atomic create_project_with_client RPC,
-- portal_load_by_token exposes name.
--
-- Other project INSERT paths (trigger fills name from client_name if empty):
--   - src/pages/NewProject.tsx → RPC create_project_with_client (this migration)
--   - Any legacy/direct insert into projects (Edge Functions do not insert projects today)
--   - Future scripts / admin: trigger protects empty name

-- ---------------------------------------------------------------------------
-- projects.name
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS name text;

UPDATE public.projects
SET name = client_name
WHERE name IS NULL OR btrim(name) = '';

ALTER TABLE public.projects
  ALTER COLUMN name SET NOT NULL;

CREATE OR REPLACE FUNCTION public.projects_default_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := coalesce(nullif(trim(NEW.name), ''), NEW.client_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_default_name ON public.projects;
CREATE TRIGGER trg_projects_default_name
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.projects_default_name();

-- ---------------------------------------------------------------------------
-- create_project_with_client (atomic)
-- p_mode: attach | update | create
-- On create email conflict: RAISE client_exists with DETAIL = client id
-- ---------------------------------------------------------------------------
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
  v_item jsonb;
  v_order int := 0;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_new_item_id uuid;
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

  v_agency_id := (p_project ->> 'agency_id')::uuid;
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'agency_required' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (v_agency_id IN (SELECT public.user_agency_ids())) THEN
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

    -- Merge: only apply non-null keys from p_client (caller omits empties)
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
      v_update := v_update || jsonb_build_object('updated_at', now());
      UPDATE public.clients
      SET
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
    -- create
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
      agency_id,
      first_name,
      last_name,
      email,
      phone,
      company_name,
      company_type,
      siret,
      vat_number,
      siren,
      code_naf,
      source_donnees_legales,
      address_street,
      address_postal_code,
      address_city,
      address_country,
      website,
      industry,
      company_size,
      notes
    ) VALUES (
      v_agency_id,
      nullif(trim(p_client ->> 'first_name'), ''),
      nullif(trim(p_client ->> 'last_name'), ''),
      v_email,
      CASE
        WHEN p_client ? 'phone' AND jsonb_typeof(p_client -> 'phone') = 'null' THEN NULL
        ELSE nullif(trim(p_client ->> 'phone'), '')
      END,
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
      -- Explicit null when caller sends null (no DEFAULT France orphan)
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
    agency_id,
    client_id,
    name,
    client_name,
    client_email,
    token,
    price
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
    END
  )
  RETURNING id, token INTO v_project_id, v_token;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.checklist_items (
        project_id,
        label,
        type,
        required,
        order_index,
        completed,
        contract_template_id,
        value,
        config
      ) VALUES (
        v_project_id,
        coalesce(nullif(trim(v_item ->> 'label'), ''), 'Étape'),
        coalesce(nullif(trim(v_item ->> 'type'), ''), 'text'),
        coalesce((v_item ->> 'required')::boolean, true),
        coalesce((v_item ->> 'order_index')::int, v_order),
        coalesce((v_item ->> 'completed')::boolean, false),
        CASE
          WHEN v_item ? 'contract_template_id'
            AND jsonb_typeof(v_item -> 'contract_template_id') <> 'null'
            AND nullif(trim(v_item ->> 'contract_template_id'), '') IS NOT NULL
          THEN (v_item ->> 'contract_template_id')::uuid
          ELSE NULL
        END,
        v_item ->> 'value',
        CASE
          WHEN v_item ? 'config' AND jsonb_typeof(v_item -> 'config') = 'object'
          THEN v_item -> 'config'
          ELSE NULL
        END
      )
      RETURNING id INTO v_new_item_id;
      v_item_ids := array_append(v_item_ids, v_new_item_id);
      v_order := v_order + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'project_id', v_project_id,
    'token', v_token,
    'client_id', v_client_id,
    'item_ids', to_jsonb(v_item_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_with_client(text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project_with_client(text, uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_with_client(text, uuid, jsonb, jsonb, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- portal_load_by_token : expose name
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_load_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project record;
  v_items jsonb;
  v_branding jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    p.id,
    p.name,
    p.client_name,
    p.client_email,
    p.status,
    p.agency_id,
    p.price,
    p.payment_status,
    p.stripe_checkout_url
  INTO v_project
  FROM public.projects p
  WHERE p.token = p_token
  LIMIT 1;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(i)::jsonb ORDER BY i.order_index), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      ci.id,
      ci.label,
      ci.type,
      ci.completed,
      CASE
        WHEN ci.type = 'credentials' THEN
          CASE
            WHEN ci.value IN ('submitted', 'cleared') THEN ci.value
            ELSE NULL
          END
        ELSE ci.value
      END AS value,
      ci.order_index,
      ci.review_status,
      ci.review_note,
      ci.config
    FROM public.checklist_items ci
    WHERE ci.project_id = v_project.id
    ORDER BY ci.order_index ASC
  ) i;

  SELECT to_jsonb(b)
  INTO v_branding
  FROM public.agency_portal_public b
  WHERE b.id = v_project.agency_id;

  RETURN jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'client_name', v_project.client_name,
      'client_email', v_project.client_email,
      'status', v_project.status,
      'agency_id', v_project.agency_id,
      'price', v_project.price,
      'payment_status', v_project.payment_status,
      'stripe_checkout_url', v_project.stripe_checkout_url
    ),
    'items', v_items,
    'branding', COALESCE(v_branding, 'null'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_load_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_load_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_load_by_token(text) TO service_role;
