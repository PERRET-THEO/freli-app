-- Devis / Factures / Avoirs (module facturation agence).
--
-- Principes :
--   * Une table `sales_documents` (kind = quote | invoice | credit_note) + lignes.
--   * Brouillon librement modifiable ; à la finalisation, numéro attribué côté serveur
--     (séquence continue par agence / type / année, sans trou), instantanés émetteur
--     et client figés, contenu verrouillé (art. 242 nonies A annexe II CGI).
--   * Totaux HT / TVA / TTC recalculés par trigger depuis les lignes (jamais depuis le client).
--   * Une facture émise ne se supprime pas : on émet un avoir qui l'annule.
--   * RLS : membres de l'agence via user_agency_ids() ; RPC SECURITY DEFINER avec contrôle
--     explicite d'appartenance, EXECUTE retiré à anon.

-- ---------------------------------------------------------------------------
-- Paramètres de facturation (1-1 avec agencies)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agency_invoicing_settings (
  agency_id uuid PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  payment_terms_days integer NOT NULL DEFAULT 30
    CHECK (payment_terms_days BETWEEN 0 AND 60),
  quote_validity_days integer NOT NULL DEFAULT 30
    CHECK (quote_validity_days BETWEEN 1 AND 365),
  default_vat_rate numeric(5,2) NOT NULL DEFAULT 20
    CHECK (default_vat_rate IN (0, 2.1, 5.5, 10, 20)),
  vat_exempt boolean NOT NULL DEFAULT false,
  vat_exemption_reason text
    CHECK (vat_exemption_reason IS NULL OR char_length(vat_exemption_reason) <= 300),
  late_penalty_rate text NOT NULL DEFAULT 'trois fois le taux d''intérêt légal'
    CHECK (char_length(late_penalty_rate) <= 200),
  iban text CHECK (iban IS NULL OR char_length(iban) <= 64),
  bic text CHECK (bic IS NULL OR char_length(bic) <= 16),
  payment_instructions text
    CHECK (payment_instructions IS NULL OR char_length(payment_instructions) <= 1000),
  footer_note text CHECK (footer_note IS NULL OR char_length(footer_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_invoicing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage invoicing settings" ON public.agency_invoicing_settings;
CREATE POLICY "Members manage invoicing settings"
  ON public.agency_invoicing_settings
  FOR ALL TO authenticated
  USING (agency_id IN (SELECT public.user_agency_ids()))
  WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('quote', 'invoice', 'credit_note')),
  status text NOT NULL DEFAULT 'draft',
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_document_id uuid REFERENCES public.sales_documents(id) ON DELETE SET NULL,
  converted_invoice_id uuid REFERENCES public.sales_documents(id) ON DELETE SET NULL,

  number text,
  number_year integer,
  number_seq integer,

  title text CHECK (title IS NULL OR char_length(title) <= 200),
  issue_date date,
  valid_until date,
  due_date date,
  service_date text CHECK (service_date IS NULL OR char_length(service_date) <= 120),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  payment_terms text CHECK (payment_terms IS NULL OR char_length(payment_terms) <= 500),

  vat_exempt boolean NOT NULL DEFAULT false,
  vat_exemption_reason text
    CHECK (vat_exemption_reason IS NULL OR char_length(vat_exemption_reason) <= 300),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),

  subtotal_ht numeric(12,2) NOT NULL DEFAULT 0,
  total_vat numeric(12,2) NOT NULL DEFAULT 0,
  total_ttc numeric(12,2) NOT NULL DEFAULT 0,
  vat_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,

  issuer_snapshot jsonb,
  client_snapshot jsonb,

  finalized_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,

  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sales_documents_status_by_kind CHECK (
    (kind = 'quote' AND status IN ('draft', 'sent', 'accepted', 'declined'))
    OR (kind = 'invoice' AND status IN ('draft', 'sent', 'paid', 'cancelled'))
    OR (kind = 'credit_note' AND status IN ('draft', 'sent'))
  ),
  CONSTRAINT sales_documents_number_when_final CHECK (
    (status = 'draft' AND number IS NULL)
    OR (status <> 'draft' AND number IS NOT NULL AND issue_date IS NOT NULL)
  ),
  CONSTRAINT sales_documents_credit_note_source CHECK (
    kind <> 'credit_note' OR source_document_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_documents_agency_number_uidx
  ON public.sales_documents (agency_id, kind, number)
  WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_documents_agency_kind_idx
  ON public.sales_documents (agency_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_documents_client_idx
  ON public.sales_documents (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_documents_project_idx
  ON public.sales_documents (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_documents_source_idx
  ON public.sales_documents (source_document_id) WHERE source_document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_documents_one_credit_note_per_invoice_uidx
  ON public.sales_documents (source_document_id)
  WHERE kind = 'credit_note';

ALTER TABLE public.sales_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read sales documents" ON public.sales_documents;
CREATE POLICY "Members read sales documents"
  ON public.sales_documents FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.user_agency_ids()));

DROP POLICY IF EXISTS "Members create draft sales documents" ON public.sales_documents;
CREATE POLICY "Members create draft sales documents"
  ON public.sales_documents FOR INSERT TO authenticated
  WITH CHECK (
    agency_id IN (SELECT public.user_agency_ids())
    AND status = 'draft'
    AND number IS NULL
  );

DROP POLICY IF EXISTS "Members update sales documents" ON public.sales_documents;
CREATE POLICY "Members update sales documents"
  ON public.sales_documents FOR UPDATE TO authenticated
  USING (agency_id IN (SELECT public.user_agency_ids()))
  WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));

-- Suppression : brouillons uniquement, et devis (pas de contrainte légale de conservation).
DROP POLICY IF EXISTS "Members delete drafts and quotes" ON public.sales_documents;
CREATE POLICY "Members delete drafts and quotes"
  ON public.sales_documents FOR DELETE TO authenticated
  USING (
    agency_id IN (SELECT public.user_agency_ids())
    AND (status = 'draft' OR kind = 'quote')
  );

-- ---------------------------------------------------------------------------
-- Lignes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sales_documents(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 1000000),
  unit text CHECK (unit IS NULL OR char_length(unit) <= 30),
  unit_price_ht numeric(12,2) NOT NULL DEFAULT 0
    CHECK (unit_price_ht >= 0 AND unit_price_ht <= 10000000),
  vat_rate numeric(5,2) NOT NULL DEFAULT 20 CHECK (vat_rate IN (0, 2.1, 5.5, 10, 20)),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100),
  line_total_ht numeric(12,2) GENERATED ALWAYS AS (
    round(quantity * unit_price_ht * (1 - discount_percent / 100), 2)
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_document_lines_document_idx
  ON public.sales_document_lines (document_id, position);
CREATE INDEX IF NOT EXISTS sales_document_lines_agency_idx
  ON public.sales_document_lines (agency_id);

ALTER TABLE public.sales_document_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage sales document lines" ON public.sales_document_lines;
CREATE POLICY "Members manage sales document lines"
  ON public.sales_document_lines FOR ALL TO authenticated
  USING (agency_id IN (SELECT public.user_agency_ids()))
  WITH CHECK (agency_id IN (SELECT public.user_agency_ids()));

-- ---------------------------------------------------------------------------
-- Compteurs de numérotation (accès uniquement via RPC SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_document_counters (
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('quote', 'invoice', 'credit_note')),
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (agency_id, kind, year)
);

ALTER TABLE public.sales_document_counters ENABLE ROW LEVEL SECURITY;
-- Aucune policy : lecture/écriture réservées aux fonctions SECURITY DEFINER.

-- ---------------------------------------------------------------------------
-- Triggers d'intégrité
-- ---------------------------------------------------------------------------

-- Lignes : agency_id cohérent avec le document, verrouillage hors brouillon.
CREATE OR REPLACE FUNCTION public.sales_document_lines_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END;
  v_status text;
  v_agency uuid;
BEGIN
  SELECT status, agency_id INTO v_status, v_agency
  FROM sales_documents WHERE id = v_doc_id;

  -- Suppression en cascade du document parent : rien à vérifier.
  IF TG_OP = 'DELETE' AND v_status IS NULL THEN
    RETURN OLD;
  END IF;

  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Document finalisé : les lignes ne sont plus modifiables.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.document_id <> OLD.document_id THEN
    RAISE EXCEPTION 'Une ligne ne peut pas changer de document.' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    NEW.agency_id := v_agency;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sales_document_lines_guard_trg ON public.sales_document_lines;
CREATE TRIGGER sales_document_lines_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_document_lines
  FOR EACH ROW EXECUTE FUNCTION public.sales_document_lines_guard();

-- Recalcul des totaux (TVA calculée par taux, arrondie au centime).
CREATE OR REPLACE FUNCTION public.recompute_sales_document_totals(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exempt boolean;
  v_breakdown jsonb;
  v_ht numeric(12,2);
  v_vat numeric(12,2);
BEGIN
  SELECT vat_exempt INTO v_exempt FROM sales_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  WITH by_rate AS (
    SELECT
      CASE WHEN v_exempt THEN 0 ELSE l.vat_rate END AS rate,
      sum(l.line_total_ht) AS base
    FROM sales_document_lines l
    WHERE l.document_id = p_document_id
    GROUP BY 1
  )
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object('rate', rate, 'base', base, 'vat', round(base * rate / 100, 2))
      ORDER BY rate DESC
    ), '[]'::jsonb),
    coalesce(sum(base), 0),
    coalesce(sum(round(base * rate / 100, 2)), 0)
  INTO v_breakdown, v_ht, v_vat
  FROM by_rate;

  UPDATE sales_documents
  SET subtotal_ht = v_ht,
      total_vat = v_vat,
      total_ttc = v_ht + v_vat,
      vat_breakdown = v_breakdown
  WHERE id = p_document_id
    AND status = 'draft';
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_sales_document_totals(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sales_document_lines_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM recompute_sales_document_totals(OLD.document_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.document_id <> OLD.document_id) THEN
    PERFORM recompute_sales_document_totals(NEW.document_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sales_document_lines_totals_trg ON public.sales_document_lines;
CREATE TRIGGER sales_document_lines_totals_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_document_lines
  FOR EACH ROW EXECUTE FUNCTION public.sales_document_lines_after_change();

-- Documents : immutabilité hors brouillon + champs protégés côté client.
CREATE OR REPLACE FUNCTION public.sales_documents_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Drapeau posé uniquement par les RPC SECURITY DEFINER ; ignoré si l'appelant
  -- est un rôle API (anon / authenticated) afin qu'il ne puisse pas le forger.
  v_rpc boolean := coalesce(current_setting('freli.sales_rpc', true), '') = 'on'
    AND current_user NOT IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT v_rpc THEN
      -- Totaux, numéros, instantanés : jamais fournis par le client.
      NEW.number := NULL;
      NEW.number_year := NULL;
      NEW.number_seq := NULL;
      NEW.status := 'draft';
      NEW.subtotal_ht := 0;
      NEW.total_vat := 0;
      NEW.total_ttc := 0;
      NEW.vat_breakdown := '[]'::jsonb;
      NEW.issuer_snapshot := NULL;
      NEW.client_snapshot := NULL;
      NEW.finalized_at := NULL;
      NEW.accepted_at := NULL;
      NEW.declined_at := NULL;
      NEW.paid_at := NULL;
      NEW.cancelled_at := NULL;
      NEW.converted_invoice_id := NULL;
      IF NEW.kind = 'credit_note' THEN
        RAISE EXCEPTION 'Un avoir se crée depuis une facture émise.' USING ERRCODE = 'P0001';
      END IF;
      NEW.source_document_id := NULL;
    END IF;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE
  NEW.updated_at := now();

  -- Actions de clé étrangère (ON DELETE SET NULL d'un client, projet ou document lié) :
  -- seules les colonnes de liaison passent à NULL, le reste est strictement identique.
  IF pg_trigger_depth() > 1
     AND (to_jsonb(NEW) - ARRAY['source_document_id', 'converted_invoice_id', 'client_id', 'project_id', 'updated_at'])
       = (to_jsonb(OLD) - ARRAY['source_document_id', 'converted_invoice_id', 'client_id', 'project_id', 'updated_at'])
     AND (NEW.source_document_id IS NULL OR NEW.source_document_id = OLD.source_document_id)
     AND (NEW.converted_invoice_id IS NULL OR NEW.converted_invoice_id = OLD.converted_invoice_id)
     AND (NEW.client_id IS NULL OR NEW.client_id = OLD.client_id)
     AND (NEW.project_id IS NULL OR NEW.project_id = OLD.project_id)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.agency_id <> OLD.agency_id OR NEW.kind <> OLD.kind
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Champ non modifiable.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_rpc THEN
    -- Hors RPC : statut, numéro, totaux, instantanés et liens figés.
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.number IS DISTINCT FROM OLD.number
       OR NEW.number_year IS DISTINCT FROM OLD.number_year
       OR NEW.number_seq IS DISTINCT FROM OLD.number_seq
       OR NEW.subtotal_ht IS DISTINCT FROM OLD.subtotal_ht
       OR NEW.total_vat IS DISTINCT FROM OLD.total_vat
       OR NEW.total_ttc IS DISTINCT FROM OLD.total_ttc
       OR NEW.vat_breakdown IS DISTINCT FROM OLD.vat_breakdown
       OR NEW.issuer_snapshot IS DISTINCT FROM OLD.issuer_snapshot
       OR NEW.client_snapshot IS DISTINCT FROM OLD.client_snapshot
       OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.declined_at IS DISTINCT FROM OLD.declined_at
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
       OR NEW.converted_invoice_id IS DISTINCT FROM OLD.converted_invoice_id
    THEN
      -- Les totaux sont réécrits par recompute (SECURITY DEFINER, appelé hors RPC) :
      -- on tolère uniquement ce cas précis (brouillon, seuls totaux modifiés).
      IF OLD.status = 'draft'
         AND NEW.status = OLD.status
         AND NEW.number IS NOT DISTINCT FROM OLD.number
         AND NEW.issuer_snapshot IS NOT DISTINCT FROM OLD.issuer_snapshot
         AND NEW.client_snapshot IS NOT DISTINCT FROM OLD.client_snapshot
         AND NEW.finalized_at IS NOT DISTINCT FROM OLD.finalized_at
         AND NEW.accepted_at IS NOT DISTINCT FROM OLD.accepted_at
         AND NEW.declined_at IS NOT DISTINCT FROM OLD.declined_at
         AND NEW.paid_at IS NOT DISTINCT FROM OLD.paid_at
         AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
         AND NEW.source_document_id IS NOT DISTINCT FROM OLD.source_document_id
         AND NEW.converted_invoice_id IS NOT DISTINCT FROM OLD.converted_invoice_id
         AND current_user <> 'authenticated'
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Utilisez les actions dédiées pour changer le statut ou la numérotation.'
        USING ERRCODE = 'P0001';
    END IF;

    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Document finalisé : il n''est plus modifiable.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Changement d'exonération TVA sur brouillon : totaux à recalculer.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_documents_guard_trg ON public.sales_documents;
CREATE TRIGGER sales_documents_guard_trg
  BEFORE INSERT OR UPDATE ON public.sales_documents
  FOR EACH ROW EXECUTE FUNCTION public.sales_documents_guard();

CREATE OR REPLACE FUNCTION public.sales_documents_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'draft' AND NEW.vat_exempt IS DISTINCT FROM OLD.vat_exempt THEN
    PERFORM recompute_sales_document_totals(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sales_documents_after_update_trg ON public.sales_documents;
CREATE TRIGGER sales_documents_after_update_trg
  AFTER UPDATE OF vat_exempt ON public.sales_documents
  FOR EACH ROW EXECUTE FUNCTION public.sales_documents_after_update();

-- Client et projet doivent appartenir à la même agence que le document.
CREATE OR REPLACE FUNCTION public.sales_documents_links_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clients WHERE id = NEW.client_id AND agency_id = NEW.agency_id
  ) THEN
    RAISE EXCEPTION 'Client introuvable pour cette agence.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM projects WHERE id = NEW.project_id AND agency_id = NEW.agency_id
  ) THEN
    RAISE EXCEPTION 'Projet introuvable pour cette agence.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_documents_links_guard_trg ON public.sales_documents;
CREATE TRIGGER sales_documents_links_guard_trg
  BEFORE INSERT OR UPDATE OF client_id, project_id, agency_id ON public.sales_documents
  FOR EACH ROW EXECUTE FUNCTION public.sales_documents_links_guard();

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sales_document_prefix(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_kind WHEN 'quote' THEN 'DEV' WHEN 'invoice' THEN 'FAC' ELSE 'AV' END;
$$;

-- Verrouille et retourne le document si l'utilisateur est membre de l'agence.
CREATE OR REPLACE FUNCTION public.sales_document_lock_for_member(p_document_id uuid)
RETURNS public.sales_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc sales_documents;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_doc FROM sales_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_doc.agency_id NOT IN (SELECT user_agency_ids()) THEN
    RAISE EXCEPTION 'Document introuvable.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_document_lock_for_member(uuid) FROM PUBLIC, anon, authenticated;

-- Finalise un brouillon : numéro continu, instantanés, verrouillage.
CREATE OR REPLACE FUNCTION public.finalize_sales_document(p_document_id uuid)
RETURNS public.sales_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc sales_documents;
  v_year integer;
  v_seq integer;
  v_settings agency_invoicing_settings;
  v_agency agencies;
  v_client clients;
  v_line_count integer;
  v_issue date;
BEGIN
  v_doc := sales_document_lock_for_member(p_document_id);

  IF v_doc.status <> 'draft' THEN
    RAISE EXCEPTION 'Ce document est déjà finalisé.' USING ERRCODE = 'P0001';
  END IF;

  IF v_doc.client_id IS NULL THEN
    RAISE EXCEPTION 'Sélectionnez un client avant de finaliser.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_line_count FROM sales_document_lines WHERE document_id = v_doc.id;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Ajoutez au moins une ligne avant de finaliser.' USING ERRCODE = 'P0001';
  END IF;

  IF v_doc.total_ttc <= 0 AND v_doc.kind <> 'quote' THEN
    RAISE EXCEPTION 'Le montant total doit être supérieur à zéro.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_agency FROM agencies WHERE id = v_doc.agency_id;
  SELECT * INTO v_client FROM clients WHERE id = v_doc.client_id;
  SELECT * INTO v_settings FROM agency_invoicing_settings WHERE agency_id = v_doc.agency_id;

  -- Les factures sont datées du jour de leur émission (chronologie des numéros).
  IF v_doc.kind = 'quote' THEN
    v_issue := coalesce(v_doc.issue_date, current_date);
  ELSE
    v_issue := current_date;
  END IF;
  v_year := extract(year FROM v_issue)::integer;

  INSERT INTO sales_document_counters (agency_id, kind, year, last_value)
  VALUES (v_doc.agency_id, v_doc.kind, v_year, 1)
  ON CONFLICT (agency_id, kind, year)
  DO UPDATE SET last_value = sales_document_counters.last_value + 1
  RETURNING last_value INTO v_seq;

  PERFORM set_config('freli.sales_rpc', 'on', true);

  UPDATE sales_documents SET
    status = 'sent',
    number = sales_document_prefix(v_doc.kind) || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0'),
    number_year = v_year,
    number_seq = v_seq,
    issue_date = v_issue,
    valid_until = CASE
      WHEN v_doc.kind = 'quote'
        THEN coalesce(v_doc.valid_until, v_issue + coalesce(v_settings.quote_validity_days, 30))
      ELSE NULL END,
    due_date = CASE
      WHEN v_doc.kind = 'invoice'
        THEN greatest(
          coalesce(v_doc.due_date, v_issue + coalesce(v_settings.payment_terms_days, 30)),
          v_issue)
      ELSE NULL END,
    finalized_at = now(),
    issuer_snapshot = jsonb_build_object(
      'name', v_agency.name,
      'legal_form', v_agency.legal_form,
      'address_street', v_agency.address_street,
      'address_postal_code', v_agency.address_postal_code,
      'address_city', v_agency.address_city,
      'siret', v_agency.siret,
      'siren', v_agency.siren,
      'vat_number', v_agency.vat_number,
      'share_capital', v_agency.share_capital,
      'rcs_city', v_agency.rcs_city,
      'contact_email', v_agency.contact_email,
      'contact_phone', v_agency.contact_phone,
      'logo_url', v_agency.logo_url,
      'brand_color', v_agency.brand_color,
      'iban', v_settings.iban,
      'bic', v_settings.bic,
      'payment_instructions', v_settings.payment_instructions,
      'late_penalty_rate', coalesce(v_settings.late_penalty_rate, 'trois fois le taux d''intérêt légal'),
      'footer_note', v_settings.footer_note
    ),
    client_snapshot = jsonb_build_object(
      'first_name', v_client.first_name,
      'last_name', v_client.last_name,
      'email', v_client.email,
      'phone', v_client.phone,
      'company_name', v_client.company_name,
      'siret', v_client.siret,
      'siren', v_client.siren,
      'vat_number', v_client.vat_number,
      'address_street', v_client.address_street,
      'address_postal_code', v_client.address_postal_code,
      'address_city', v_client.address_city,
      'address_country', v_client.address_country
    )
  WHERE id = v_doc.id
  RETURNING * INTO v_doc;

  -- Un avoir finalisé annule la facture d'origine.
  IF v_doc.kind = 'credit_note' THEN
    UPDATE sales_documents
    SET status = 'cancelled', cancelled_at = now()
    WHERE id = v_doc.source_document_id
      AND kind = 'invoice'
      AND status IN ('sent', 'paid');
  END IF;

  PERFORM set_config('freli.sales_rpc', 'off', true);
  RETURN v_doc;
END;
$$;

-- Transitions de statut autorisées après finalisation.
CREATE OR REPLACE FUNCTION public.set_sales_document_status(p_document_id uuid, p_status text)
RETURNS public.sales_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc sales_documents;
  v_ok boolean := false;
BEGIN
  v_doc := sales_document_lock_for_member(p_document_id);

  IF v_doc.status = 'draft' THEN
    RAISE EXCEPTION 'Finalisez le document avant de changer son statut.' USING ERRCODE = 'P0001';
  END IF;

  IF v_doc.kind = 'quote' THEN
    v_ok := (v_doc.status = 'sent' AND p_status IN ('accepted', 'declined'))
         OR (v_doc.status IN ('accepted', 'declined') AND p_status = 'sent'
             AND v_doc.converted_invoice_id IS NULL);
  ELSIF v_doc.kind = 'invoice' THEN
    v_ok := (v_doc.status = 'sent' AND p_status = 'paid')
         OR (v_doc.status = 'paid' AND p_status = 'sent');
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Changement de statut non autorisé.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('freli.sales_rpc', 'on', true);
  UPDATE sales_documents SET
    status = p_status,
    accepted_at = CASE WHEN p_status = 'accepted' THEN now()
                       WHEN p_status = 'sent' AND kind = 'quote' THEN NULL ELSE accepted_at END,
    declined_at = CASE WHEN p_status = 'declined' THEN now()
                       WHEN p_status = 'sent' AND kind = 'quote' THEN NULL ELSE declined_at END,
    paid_at = CASE WHEN p_status = 'paid' THEN now()
                   WHEN p_status = 'sent' AND kind = 'invoice' THEN NULL ELSE paid_at END
  WHERE id = v_doc.id
  RETURNING * INTO v_doc;
  PERFORM set_config('freli.sales_rpc', 'off', true);

  RETURN v_doc;
END;
$$;

-- Copie les lignes d'un document vers un nouveau brouillon (usage interne).
CREATE OR REPLACE FUNCTION public.sales_document_clone_draft(
  p_source sales_documents,
  p_kind text,
  p_link_source boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
  v_settings agency_invoicing_settings;
BEGIN
  SELECT * INTO v_settings FROM agency_invoicing_settings WHERE agency_id = p_source.agency_id;

  PERFORM set_config('freli.sales_rpc', 'on', true);
  INSERT INTO sales_documents (
    agency_id, kind, status, client_id, project_id, source_document_id,
    title, notes, payment_terms, vat_exempt, vat_exemption_reason, service_date, created_by
  ) VALUES (
    p_source.agency_id, p_kind, 'draft', p_source.client_id, p_source.project_id,
    CASE WHEN p_link_source THEN p_source.id ELSE NULL END,
    p_source.title,
    p_source.notes,
    CASE WHEN p_kind = 'quote' THEN NULL ELSE p_source.payment_terms END,
    p_source.vat_exempt, p_source.vat_exemption_reason, p_source.service_date, auth.uid()
  )
  RETURNING id INTO v_new_id;
  PERFORM set_config('freli.sales_rpc', 'off', true);

  INSERT INTO sales_document_lines (
    document_id, agency_id, position, description, quantity, unit, unit_price_ht,
    vat_rate, discount_percent
  )
  SELECT v_new_id, agency_id, position, description, quantity, unit, unit_price_ht,
         vat_rate, discount_percent
  FROM sales_document_lines
  WHERE document_id = p_source.id
  ORDER BY position;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_document_clone_draft(public.sales_documents, text, boolean)
  FROM PUBLIC, anon, authenticated;

-- Devis (envoyé/accepté) → facture brouillon. Le devis passe en « accepté ».
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc sales_documents;
  v_invoice_id uuid;
BEGIN
  v_doc := sales_document_lock_for_member(p_quote_id);

  IF v_doc.kind <> 'quote' THEN
    RAISE EXCEPTION 'Seul un devis peut être converti en facture.' USING ERRCODE = 'P0001';
  END IF;
  IF v_doc.status NOT IN ('sent', 'accepted') THEN
    RAISE EXCEPTION 'Le devis doit être finalisé et non refusé.' USING ERRCODE = 'P0001';
  END IF;
  IF v_doc.converted_invoice_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM sales_documents WHERE id = v_doc.converted_invoice_id) THEN
    RETURN v_doc.converted_invoice_id;
  END IF;

  v_invoice_id := sales_document_clone_draft(v_doc, 'invoice', true);

  PERFORM set_config('freli.sales_rpc', 'on', true);
  UPDATE sales_documents SET
    converted_invoice_id = v_invoice_id,
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now())
  WHERE id = v_doc.id;
  PERFORM set_config('freli.sales_rpc', 'off', true);

  RETURN v_invoice_id;
END;
$$;

-- Facture émise/payée → avoir brouillon (même contenu). Un seul avoir par facture.
CREATE OR REPLACE FUNCTION public.create_credit_note_from_invoice(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc sales_documents;
  v_existing uuid;
BEGIN
  v_doc := sales_document_lock_for_member(p_invoice_id);

  IF v_doc.kind <> 'invoice' OR v_doc.status NOT IN ('sent', 'paid') THEN
    RAISE EXCEPTION 'Un avoir se crée depuis une facture émise.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_existing FROM sales_documents
  WHERE source_document_id = v_doc.id AND kind = 'credit_note';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  RETURN sales_document_clone_draft(v_doc, 'credit_note', true);
END;
$$;

-- Duplique n'importe quel document en brouillon du même type (avoir → facture).
CREATE OR REPLACE FUNCTION public.duplicate_sales_document(p_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc sales_documents;
BEGIN
  v_doc := sales_document_lock_for_member(p_document_id);
  RETURN sales_document_clone_draft(
    v_doc,
    CASE WHEN v_doc.kind = 'credit_note' THEN 'invoice' ELSE v_doc.kind END,
    false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_sales_document(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_sales_document_status(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_credit_note_from_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.duplicate_sales_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_sales_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_sales_document_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_credit_note_from_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_sales_document(uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_document_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_invoicing_settings TO authenticated;
REVOKE ALL ON public.sales_documents, public.sales_document_lines,
  public.agency_invoicing_settings, public.sales_document_counters FROM anon;
