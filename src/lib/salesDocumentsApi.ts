import { supabase } from './supabase'
import {
  DEFAULT_VAT_EXEMPTION_REASON,
  defaultInvoicingSettings,
  suggestsVatExemption,
  type DraftLineInput,
  type InvoicingSettings,
  type SalesDocument,
  type SalesDocumentKind,
  type SalesDocumentLine,
  type SalesDocumentStatus,
} from './salesDocuments'

/** Erreur métier lisible (messages SQL déjà en français). */
export class SalesDocumentError extends Error {}

/**
 * Les RAISE EXCEPTION de la migration (codes P0001 / P0002) portent un message
 * français destiné à l'utilisateur ; les autres erreurs restent génériques.
 */
export function toSalesError(
  error: { message?: string; code?: string } | null,
  fallback: string,
): SalesDocumentError {
  const raw = error?.message?.trim()
  if ((error?.code === 'P0001' || error?.code === 'P0002') && raw) {
    return new SalesDocumentError(raw)
  }
  if (error?.code === '42501' || (raw && /row-level security|permission denied/i.test(raw))) {
    return new SalesDocumentError('Action non autorisée sur ce document.')
  }
  if (error?.code === '23514') {
    return new SalesDocumentError('Valeur invalide : vérifiez les montants, taux de TVA et délais.')
  }
  return new SalesDocumentError(fallback)
}

const toError = toSalesError

const DOCUMENT_COLUMNS =
  'id, agency_id, kind, status, client_id, project_id, source_document_id, converted_invoice_id, number, title, issue_date, valid_until, due_date, service_date, notes, payment_terms, vat_exempt, vat_exemption_reason, subtotal_ht, total_vat, total_ttc, vat_breakdown, issuer_snapshot, client_snapshot, finalized_at, accepted_at, declined_at, paid_at, cancelled_at, created_at, updated_at'

export type SalesDocumentListRow = SalesDocument & {
  client: {
    id: string
    first_name: string
    last_name: string
    company_name: string | null
    email: string
  } | null
}

function normalizeDocument<T extends SalesDocument>(row: T): T {
  return {
    ...row,
    subtotal_ht: Number(row.subtotal_ht),
    total_vat: Number(row.total_vat),
    total_ttc: Number(row.total_ttc),
    vat_breakdown: Array.isArray(row.vat_breakdown)
      ? row.vat_breakdown.map((b) => ({
          rate: Number(b.rate),
          base: Number(b.base),
          vat: Number(b.vat),
        }))
      : [],
  }
}

function normalizeLine(row: SalesDocumentLine): SalesDocumentLine {
  return {
    ...row,
    quantity: Number(row.quantity),
    unit_price_ht: Number(row.unit_price_ht),
    vat_rate: Number(row.vat_rate),
    discount_percent: Number(row.discount_percent),
  }
}

export async function listSalesDocuments(
  agencyId: string,
  filters: { kind?: SalesDocumentKind; clientId?: string; projectId?: string } = {},
): Promise<SalesDocumentListRow[]> {
  let query = supabase
    .from('sales_documents')
    .select(`${DOCUMENT_COLUMNS}, client:clients(id, first_name, last_name, company_name, email)`)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  const { data, error } = await query
  if (error) throw toError(error, 'Impossible de charger les documents.')
  return ((data ?? []) as unknown as SalesDocumentListRow[]).map(normalizeDocument)
}

export type SalesDocumentDetail = {
  document: SalesDocument
  lines: SalesDocumentLine[]
  creditNoteId: string | null
  sourceNumber: string | null
  convertedInvoiceNumber: string | null
}

export async function getSalesDocument(id: string): Promise<SalesDocumentDetail | null> {
  const { data, error } = await supabase
    .from('sales_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw toError(error, 'Impossible de charger le document.')
  if (!data) return null
  const document = normalizeDocument(data as unknown as SalesDocument)

  const relatedIds = [document.source_document_id, document.converted_invoice_id].filter(
    (v): v is string => Boolean(v),
  )
  const [linesRes, creditRes, relatedRes] = await Promise.all([
    supabase
      .from('sales_document_lines')
      .select('id, position, description, quantity, unit, unit_price_ht, vat_rate, discount_percent')
      .eq('document_id', id)
      .order('position', { ascending: true }),
    document.kind === 'invoice'
      ? supabase
          .from('sales_documents')
          .select('id')
          .eq('source_document_id', id)
          .eq('kind', 'credit_note')
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    relatedIds.length
      ? supabase.from('sales_documents').select('id, number').in('id', relatedIds)
      : Promise.resolve({ data: [] as { id: string; number: string | null }[], error: null }),
  ])
  if (linesRes.error) throw toError(linesRes.error, 'Impossible de charger les lignes.')
  const related = new Map(
    ((relatedRes.data ?? []) as { id: string; number: string | null }[]).map((r) => [r.id, r.number]),
  )

  return {
    document,
    lines: ((linesRes.data ?? []) as SalesDocumentLine[]).map(normalizeLine),
    creditNoteId: (creditRes.data as { id: string } | null)?.id ?? null,
    sourceNumber: document.source_document_id ? related.get(document.source_document_id) ?? null : null,
    convertedInvoiceNumber: document.converted_invoice_id
      ? related.get(document.converted_invoice_id) ?? null
      : null,
  }
}

export type DraftHeaderInput = {
  client_id: string | null
  project_id: string | null
  title: string | null
  issue_date: string | null
  valid_until: string | null
  due_date: string | null
  service_date: string | null
  notes: string | null
  payment_terms: string | null
  vat_exempt: boolean
  vat_exemption_reason: string | null
}

export async function createSalesDocumentDraft(
  agencyId: string,
  kind: Exclude<SalesDocumentKind, 'credit_note'>,
  header: DraftHeaderInput,
): Promise<string> {
  const { data, error } = await supabase
    .from('sales_documents')
    .insert({ agency_id: agencyId, kind, ...header })
    .select('id')
    .single()
  if (error) throw toError(error, 'Impossible de créer le brouillon.')
  return (data as { id: string }).id
}

export async function updateSalesDocumentDraft(id: string, header: DraftHeaderInput): Promise<void> {
  const { error } = await supabase.from('sales_documents').update(header).eq('id', id)
  if (error) throw toError(error, "Impossible d'enregistrer le brouillon.")
}

/**
 * Synchronise les lignes d'un brouillon : upsert par id puis suppression des lignes retirées.
 * (Les totaux sont recalculés par le trigger SQL.)
 */
export async function saveSalesDocumentLines(
  documentId: string,
  agencyId: string,
  lines: DraftLineInput[],
  previousIds: string[],
): Promise<void> {
  const payload = lines.map((line, index) => ({
    id: line.id,
    document_id: documentId,
    agency_id: agencyId,
    position: index,
    description: line.description.trim(),
    quantity: line.quantity,
    unit: line.unit?.trim() || null,
    unit_price_ht: line.unit_price_ht,
    vat_rate: line.vat_rate,
    discount_percent: line.discount_percent,
  }))
  if (payload.length > 0) {
    const { error } = await supabase.from('sales_document_lines').upsert(payload, { onConflict: 'id' })
    if (error) throw toError(error, "Impossible d'enregistrer les lignes.")
  }
  const keep = new Set(lines.map((l) => l.id))
  const removed = previousIds.filter((id) => !keep.has(id))
  if (removed.length > 0) {
    const { error } = await supabase
      .from('sales_document_lines')
      .delete()
      .eq('document_id', documentId)
      .in('id', removed)
    if (error) throw toError(error, 'Impossible de supprimer des lignes.')
  }
}

async function rpcDocument(fn: string, args: Record<string, unknown>, fallback: string) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw toError(error, fallback)
  return data
}

export async function finalizeSalesDocument(id: string): Promise<SalesDocument> {
  const data = await rpcDocument(
    'finalize_sales_document',
    { p_document_id: id },
    'Impossible de finaliser le document.',
  )
  return normalizeDocument(data as SalesDocument)
}

export async function setSalesDocumentStatus(
  id: string,
  status: SalesDocumentStatus,
): Promise<SalesDocument> {
  const data = await rpcDocument(
    'set_sales_document_status',
    { p_document_id: id, p_status: status },
    'Impossible de changer le statut.',
  )
  return normalizeDocument(data as SalesDocument)
}

export async function convertQuoteToInvoice(quoteId: string): Promise<string> {
  return (await rpcDocument(
    'convert_quote_to_invoice',
    { p_quote_id: quoteId },
    'Impossible de convertir le devis.',
  )) as string
}

export async function createCreditNote(invoiceId: string): Promise<string> {
  return (await rpcDocument(
    'create_credit_note_from_invoice',
    { p_invoice_id: invoiceId },
    "Impossible de créer l'avoir.",
  )) as string
}

export async function duplicateSalesDocument(id: string): Promise<string> {
  return (await rpcDocument(
    'duplicate_sales_document',
    { p_document_id: id },
    'Impossible de dupliquer le document.',
  )) as string
}

export async function deleteSalesDocument(id: string): Promise<void> {
  const { data, error } = await supabase.from('sales_documents').delete().eq('id', id).select('id')
  if (error) throw toError(error, 'Impossible de supprimer le document.')
  if (!data || data.length === 0) {
    throw new SalesDocumentError('Ce document ne peut pas être supprimé (facture émise : créez un avoir).')
  }
}

export async function getInvoicingSettings(agencyId: string): Promise<InvoicingSettings> {
  const { data, error } = await supabase
    .from('agency_invoicing_settings')
    .select(
      'agency_id, payment_terms_days, quote_validity_days, default_vat_rate, vat_exempt, vat_exemption_reason, late_penalty_rate, iban, bic, payment_instructions, footer_note',
    )
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (error) throw toError(error, 'Impossible de charger les paramètres de facturation.')
  if (!data) {
    // Pas encore de paramètres : on part de la situation légale de l'agence.
    const defaults = defaultInvoicingSettings(agencyId)
    const { data: agency } = await supabase
      .from('agencies')
      .select('legal_form, vat_number')
      .eq('id', agencyId)
      .maybeSingle()
    if (suggestsVatExemption(agency as { legal_form: string | null; vat_number: string | null } | null)) {
      return {
        ...defaults,
        vat_exempt: true,
        vat_exemption_reason: DEFAULT_VAT_EXEMPTION_REASON,
        default_vat_rate: 0,
      }
    }
    return defaults
  }
  const row = data as InvoicingSettings
  return { ...row, default_vat_rate: Number(row.default_vat_rate) }
}

export async function saveInvoicingSettings(settings: InvoicingSettings): Promise<void> {
  const { error } = await supabase
    .from('agency_invoicing_settings')
    .upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: 'agency_id' })
  if (error) throw toError(error, "Impossible d'enregistrer les paramètres de facturation.")
}

export type AgencyIssuerRow = {
  name: string | null
  legal_form: string | null
  address_street: string | null
  address_postal_code: string | null
  address_city: string | null
  siret: string | null
  siren: string | null
  vat_number: string | null
  share_capital: string | null
  rcs_city: string | null
  contact_email: string | null
  contact_phone: string | null
  brand_color: string | null
  logo_url: string | null
}

export async function getAgencyIssuer(agencyId: string): Promise<AgencyIssuerRow | null> {
  const { data, error } = await supabase
    .from('agencies')
    .select(
      'name, legal_form, address_street, address_postal_code, address_city, siret, siren, vat_number, share_capital, rcs_city, contact_email, contact_phone, brand_color, logo_url',
    )
    .eq('id', agencyId)
    .maybeSingle()
  if (error) throw toError(error, "Impossible de charger les informations de l'agence.")
  return (data as AgencyIssuerRow | null) ?? null
}

export type ClientOption = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company_name: string | null
  siret: string | null
  siren: string | null
  vat_number: string | null
  address_street: string | null
  address_postal_code: string | null
  address_city: string | null
  address_country: string | null
}

export async function listClientOptions(agencyId: string): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from('clients')
    .select(
      'id, first_name, last_name, email, phone, company_name, siret, siren, vat_number, address_street, address_postal_code, address_city, address_country',
    )
    .eq('agency_id', agencyId)
    .order('company_name', { ascending: true, nullsFirst: false })
    .order('last_name', { ascending: true })
    .limit(2000)
  if (error) throw toError(error, 'Impossible de charger les clients.')
  return (data ?? []) as ClientOption[]
}

export type ProjectOption = { id: string; name: string; price: number | null }

export async function listProjectOptions(clientId: string): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, price')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw toError(error, 'Impossible de charger les projets.')
  return ((data ?? []) as ProjectOption[]).map((p) => ({
    ...p,
    price: p.price == null ? null : Number(p.price),
  }))
}
