-- Lien devis ↔ projet ↔ paiement Stripe ↔ facture
--
-- 1. Un devis rattaché à un projet et accepté (ou converti en facture) fixe le
--    prix du projet = total TTC du devis, tant que le projet n'est pas payé.
--    Le trigger existant projects_invalidate_checkout_on_amount_change invalide
--    alors l'ancien lien de paiement Stripe.
-- 2. Quand le client paie le projet via Stripe, le webhook appelle
--    create_invoice_for_project_payment : la facture est créée depuis le devis
--    accepté (ou depuis le prix du projet), numérotée et marquée payée.
--    Si les montants ne concordent pas, une facture brouillon est préparée
--    pour vérification par l'agence. Idempotent (référence de paiement unique).

-- ---------------------------------------------------------------------------
-- Référence de paiement (session Stripe) sur la facture
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales_documents
  ADD COLUMN IF NOT EXISTS payment_reference text
    CHECK (payment_reference IS NULL OR char_length(payment_reference) <= 255);

CREATE UNIQUE INDEX IF NOT EXISTS sales_documents_payment_reference_uidx
  ON public.sales_documents (agency_id, payment_reference)
  WHERE payment_reference IS NOT NULL;

-- Hors RPC, la référence de paiement n'est jamais modifiable.
CREATE OR REPLACE FUNCTION public.sales_documents_payment_reference_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rpc boolean := coalesce(current_setting('freli.sales_rpc', true), '') = 'on'
    AND current_user NOT IN ('authenticated', 'anon');
BEGIN
  IF v_rpc THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.payment_reference := NULL;
  ELSIF NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
        AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Champ non modifiable.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_documents_payment_reference_guard_trg ON public.sales_documents;
CREATE TRIGGER sales_documents_payment_reference_guard_trg
  BEFORE INSERT OR UPDATE OF payment_reference ON public.sales_documents
  FOR EACH ROW EXECUTE FUNCTION public.sales_documents_payment_reference_guard();

-- ---------------------------------------------------------------------------
-- Les RPC de facturation acceptent aussi le rôle service (webhook Stripe).
-- Identique à la version précédente, plus l'exception service_role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_document_lock_for_member(p_document_id uuid)
RETURNS public.sales_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc sales_documents;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    SELECT * INTO v_doc FROM sales_documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Document introuvable.' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_doc;
  END IF;

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

-- ---------------------------------------------------------------------------
-- 1. Devis accepté → prix du projet
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_documents_sync_project_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.kind <> 'quote' OR NEW.status <> 'accepted' OR NEW.project_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'accepted'
     AND OLD.project_id IS NOT DISTINCT FROM NEW.project_id THEN
    RETURN NULL;
  END IF;
  IF NEW.total_ttc IS NULL OR NEW.total_ttc <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.projects
  SET price = NEW.total_ttc
  WHERE id = NEW.project_id
    AND agency_id = NEW.agency_id
    AND coalesce(payment_status, 'pending') NOT IN ('paid', 'refunded')
    AND price IS DISTINCT FROM NEW.total_ttc;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sales_documents_sync_project_price_trg ON public.sales_documents;
CREATE TRIGGER sales_documents_sync_project_price_trg
  AFTER UPDATE OF status, project_id ON public.sales_documents
  FOR EACH ROW EXECUTE FUNCTION public.sales_documents_sync_project_price();

REVOKE EXECUTE ON FUNCTION public.sales_documents_sync_project_price() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_documents_payment_reference_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Paiement Stripe d'un projet → facture
--    Retour : { invoice_id, status: 'paid' | 'needs_review' | 'exists' | 'skipped', reason }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice_for_project_payment(
  p_project_id uuid,
  p_payment_reference text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project projects;
  v_agency agencies;
  v_settings agency_invoicing_settings;
  v_quote sales_documents;
  v_invoice sales_documents;
  v_invoice_id uuid;
  v_vat_exempt boolean;
  v_vat_rate numeric(5,2);
  v_unit_ht numeric(12,2);
  v_note text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Réservé au service de paiement.' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_project FROM projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'project_not_found');
  END IF;

  -- Déjà traité pour ce paiement.
  IF p_payment_reference IS NOT NULL THEN
    SELECT * INTO v_invoice FROM sales_documents
    WHERE agency_id = v_project.agency_id AND payment_reference = p_payment_reference;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'exists', 'invoice_id', v_invoice.id);
    END IF;
  END IF;

  -- Acompte : la facture d'acompte reste à l'initiative de l'agence.
  IF coalesce(v_project.amount_type, 'full') <> 'full' THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'deposit');
  END IF;

  -- Une facture payée existe déjà pour ce projet : ne rien dupliquer.
  IF EXISTS (
    SELECT 1 FROM sales_documents
    WHERE project_id = v_project.id AND kind = 'invoice' AND status = 'paid'
  ) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'already_invoiced');
  END IF;

  v_note := 'Réglé par carte bancaire (Stripe) le '
    || to_char(now() AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY') || '.';

  -- Devis du projet : accepté en priorité, sinon envoyé du même montant (le plus récent).
  SELECT * INTO v_quote FROM sales_documents
  WHERE project_id = v_project.id
    AND kind = 'quote'
    AND (status = 'accepted' OR (status = 'sent' AND total_ttc = round(p_amount, 2)))
  ORDER BY (status = 'accepted') DESC, coalesce(accepted_at, finalized_at) DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    IF v_quote.converted_invoice_id IS NOT NULL THEN
      SELECT * INTO v_invoice FROM sales_documents WHERE id = v_quote.converted_invoice_id;
      IF FOUND AND v_invoice.status IN ('paid', 'cancelled') THEN
        RETURN jsonb_build_object('status', 'skipped', 'reason', 'quote_already_invoiced',
          'invoice_id', v_invoice.id);
      END IF;
      IF FOUND THEN
        v_invoice_id := v_invoice.id;
      END IF;
    END IF;
    IF v_invoice_id IS NULL THEN
      v_invoice_id := convert_quote_to_invoice(v_quote.id);
    END IF;
  ELSE
    -- Pas de devis : facture d'une ligne depuis le prix du projet.
    IF v_project.client_id IS NULL THEN
      RETURN jsonb_build_object('status', 'skipped', 'reason', 'no_client');
    END IF;

    SELECT * INTO v_agency FROM agencies WHERE id = v_project.agency_id;
    SELECT * INTO v_settings FROM agency_invoicing_settings WHERE agency_id = v_project.agency_id;
    IF v_settings.agency_id IS NOT NULL THEN
      v_vat_exempt := v_settings.vat_exempt;
      v_vat_rate := CASE WHEN v_settings.vat_exempt THEN 0 ELSE v_settings.default_vat_rate END;
    ELSE
      -- Même règle par défaut que l'interface (micro-entreprise sans n° de TVA).
      v_vat_exempt := coalesce(v_agency.legal_form, '') ~* '(auto|micro)[- ]?entrepr'
        AND nullif(trim(coalesce(v_agency.vat_number, '')), '') IS NULL;
      v_vat_rate := CASE WHEN v_vat_exempt THEN 0 ELSE 20 END;
    END IF;
    v_unit_ht := round(p_amount / (1 + v_vat_rate / 100), 2);

    PERFORM set_config('freli.sales_rpc', 'on', true);
    INSERT INTO sales_documents (
      agency_id, kind, status, client_id, project_id, title, payment_terms,
      vat_exempt, vat_exemption_reason, due_date, created_by
    ) VALUES (
      v_project.agency_id, 'invoice', 'draft', v_project.client_id, v_project.id,
      left(coalesce(nullif(trim(v_project.name), ''), 'Prestation'), 200),
      'Paiement comptant à réception de facture.',
      v_vat_exempt,
      CASE WHEN v_vat_exempt
        THEN coalesce(v_settings.vat_exemption_reason, 'TVA non applicable, art. 293 B du CGI')
        ELSE NULL END,
      current_date,
      NULL
    )
    RETURNING id INTO v_invoice_id;
    PERFORM set_config('freli.sales_rpc', 'off', true);

    INSERT INTO sales_document_lines (
      document_id, agency_id, position, description, quantity, unit, unit_price_ht, vat_rate
    ) VALUES (
      v_invoice_id, v_project.agency_id, 0,
      left(coalesce(nullif(trim(v_project.name), ''), 'Prestation'), 2000),
      1, NULL, v_unit_ht, v_vat_rate
    );
  END IF;

  SELECT * INTO v_invoice FROM sales_documents WHERE id = v_invoice_id;

  -- Référence de paiement + mention de règlement (sur le brouillon).
  IF v_invoice.status = 'draft' THEN
    PERFORM set_config('freli.sales_rpc', 'on', true);
    UPDATE sales_documents SET
      payment_reference = p_payment_reference,
      payment_terms = 'Paiement comptant à réception de facture.',
      due_date = current_date,
      notes = left(concat_ws(E'\n', nullif(trim(notes), ''), v_note), 4000)
    WHERE id = v_invoice_id
    RETURNING * INTO v_invoice;
    PERFORM set_config('freli.sales_rpc', 'off', true);
  END IF;

  -- Les montants doivent concorder pour émettre une facture « payée ».
  IF v_invoice.total_ttc <> round(p_amount, 2) THEN
    RETURN jsonb_build_object('status', 'needs_review', 'reason', 'amount_mismatch',
      'invoice_id', v_invoice_id, 'invoice_total', v_invoice.total_ttc, 'paid', p_amount);
  END IF;

  IF v_invoice.status = 'draft' THEN
    BEGIN
      v_invoice := finalize_sales_document(v_invoice_id);
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('status', 'needs_review', 'reason', SQLERRM, 'invoice_id', v_invoice_id);
    END;
  END IF;

  IF v_invoice.status = 'sent' THEN
    v_invoice := set_sales_document_status(v_invoice_id, 'paid');
  END IF;

  IF v_invoice.payment_reference IS NULL AND p_payment_reference IS NOT NULL THEN
    PERFORM set_config('freli.sales_rpc', 'on', true);
    UPDATE sales_documents SET payment_reference = p_payment_reference WHERE id = v_invoice_id;
    PERFORM set_config('freli.sales_rpc', 'off', true);
  END IF;

  RETURN jsonb_build_object('status', 'paid', 'invoice_id', v_invoice_id,
    'number', v_invoice.number);
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_for_project_payment(uuid, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_project_payment(uuid, text, numeric)
  TO service_role;
