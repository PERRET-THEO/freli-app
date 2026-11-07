-- Facture créée depuis un devis (ou duplicata) : échéance et conditions de paiement
-- pré-remplies depuis les paramètres de facturation de l'agence.
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
  v_terms_days integer;
  v_validity_days integer;
BEGIN
  SELECT * INTO v_settings FROM agency_invoicing_settings WHERE agency_id = p_source.agency_id;
  v_terms_days := coalesce(v_settings.payment_terms_days, 30);
  v_validity_days := coalesce(v_settings.quote_validity_days, 30);

  PERFORM set_config('freli.sales_rpc', 'on', true);
  INSERT INTO sales_documents (
    agency_id, kind, status, client_id, project_id, source_document_id,
    title, notes, payment_terms, vat_exempt, vat_exemption_reason, service_date,
    issue_date, valid_until, due_date, created_by
  ) VALUES (
    p_source.agency_id, p_kind, 'draft', p_source.client_id, p_source.project_id,
    CASE WHEN p_link_source THEN p_source.id ELSE NULL END,
    p_source.title,
    p_source.notes,
    CASE
      WHEN p_kind = 'quote' THEN p_source.payment_terms
      WHEN p_kind = 'invoice' AND p_source.kind = 'invoice' AND p_source.payment_terms IS NOT NULL
        THEN p_source.payment_terms
      WHEN p_kind = 'invoice' THEN
        CASE WHEN v_terms_days = 0 THEN 'Paiement comptant à réception de facture.'
             ELSE 'Paiement à ' || v_terms_days || ' jours à compter de la date d''émission.' END
      ELSE NULL
    END,
    p_source.vat_exempt, p_source.vat_exemption_reason, p_source.service_date,
    CASE WHEN p_kind = 'quote' THEN current_date ELSE NULL END,
    CASE WHEN p_kind = 'quote' THEN current_date + v_validity_days ELSE NULL END,
    CASE WHEN p_kind = 'invoice' THEN current_date + v_terms_days ELSE NULL END,
    auth.uid()
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
