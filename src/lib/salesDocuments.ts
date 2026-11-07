import { formatPersonName } from './formatPersonName'

/**
 * Devis / Factures / Avoirs — logique métier pure (sans Supabase).
 *
 * Les montants sont recalculés côté serveur (trigger SQL) ; ce module reproduit
 * exactement le même calcul pour l'aperçu en direct dans l'éditeur.
 */

export type SalesDocumentKind = 'quote' | 'invoice' | 'credit_note'

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled'
export type CreditNoteStatus = 'draft' | 'sent'
export type SalesDocumentStatus = QuoteStatus | InvoiceStatus | CreditNoteStatus

/** Statut affiché : ajoute les états dérivés « expiré » et « en retard ». */
export type SalesDisplayStatus = SalesDocumentStatus | 'expired' | 'overdue'

export const VAT_RATES = [20, 10, 5.5, 2.1, 0] as const
export type VatRate = (typeof VAT_RATES)[number]

export const LINE_UNITS = ['', 'h', 'jour', 'forfait', 'unité', 'mois', 'page'] as const

export const DEFAULT_VAT_EXEMPTION_REASON = 'TVA non applicable, art. 293 B du CGI'
export const DEFAULT_LATE_PENALTY_RATE = "trois fois le taux d'intérêt légal"

export type PartySnapshot = Record<string, string | null | undefined>

export type VatBreakdownRow = { rate: number; base: number; vat: number }

export type SalesDocumentLine = {
  id: string
  position: number
  description: string
  quantity: number
  unit: string | null
  unit_price_ht: number
  vat_rate: number
  discount_percent: number
}

export type SalesDocument = {
  id: string
  agency_id: string
  kind: SalesDocumentKind
  status: SalesDocumentStatus
  client_id: string | null
  project_id: string | null
  source_document_id: string | null
  converted_invoice_id: string | null
  number: string | null
  title: string | null
  issue_date: string | null
  valid_until: string | null
  due_date: string | null
  service_date: string | null
  notes: string | null
  payment_terms: string | null
  vat_exempt: boolean
  vat_exemption_reason: string | null
  subtotal_ht: number
  total_vat: number
  total_ttc: number
  vat_breakdown: VatBreakdownRow[]
  issuer_snapshot: PartySnapshot | null
  client_snapshot: PartySnapshot | null
  finalized_at: string | null
  accepted_at: string | null
  declined_at: string | null
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export type InvoicingSettings = {
  agency_id: string
  payment_terms_days: number
  quote_validity_days: number
  default_vat_rate: number
  vat_exempt: boolean
  vat_exemption_reason: string | null
  late_penalty_rate: string
  iban: string | null
  bic: string | null
  payment_instructions: string | null
  footer_note: string | null
}

export function defaultInvoicingSettings(agencyId: string): InvoicingSettings {
  return {
    agency_id: agencyId,
    payment_terms_days: 30,
    quote_validity_days: 30,
    default_vat_rate: 20,
    vat_exempt: false,
    vat_exemption_reason: null,
    late_penalty_rate: DEFAULT_LATE_PENALTY_RATE,
    iban: null,
    bic: null,
    payment_instructions: null,
    footer_note: null,
  }
}

// ---------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------

export const KIND_LABELS: Record<
  SalesDocumentKind,
  { singular: string; plural: string; title: string; prefix: string; newLabel: string }
> = {
  quote: { singular: 'Devis', plural: 'Devis', title: 'DEVIS', prefix: 'DEV', newLabel: 'Nouveau devis' },
  invoice: {
    singular: 'Facture',
    plural: 'Factures',
    title: 'FACTURE',
    prefix: 'FAC',
    newLabel: 'Nouvelle facture',
  },
  credit_note: {
    singular: 'Avoir',
    plural: 'Avoirs',
    title: 'AVOIR',
    prefix: 'AV',
    newLabel: 'Nouvel avoir',
  },
}

const STATUS_LABELS: Record<SalesDocumentKind, Partial<Record<SalesDisplayStatus, string>>> = {
  quote: {
    draft: 'Brouillon',
    sent: 'En attente',
    accepted: 'Accepté',
    declined: 'Refusé',
    expired: 'Expiré',
  },
  invoice: {
    draft: 'Brouillon',
    sent: 'À encaisser',
    overdue: 'En retard',
    paid: 'Payée',
    cancelled: 'Annulée',
  },
  credit_note: {
    draft: 'Brouillon',
    sent: 'Émis',
  },
}

export function salesStatusLabel(kind: SalesDocumentKind, status: SalesDisplayStatus): string {
  return STATUS_LABELS[kind][status] ?? status
}

export type SalesStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted'

export function salesStatusTone(status: SalesDisplayStatus): SalesStatusTone {
  switch (status) {
    case 'draft':
      return 'neutral'
    case 'sent':
      return 'info'
    case 'accepted':
    case 'paid':
      return 'success'
    case 'overdue':
    case 'expired':
      return 'warning'
    case 'declined':
      return 'danger'
    case 'cancelled':
      return 'muted'
    default:
      return 'neutral'
  }
}

/** Filtres de statut proposés dans la liste, par type. */
export function statusFiltersFor(kind: SalesDocumentKind): SalesDisplayStatus[] {
  switch (kind) {
    case 'quote':
      return ['draft', 'sent', 'accepted', 'declined', 'expired']
    case 'invoice':
      return ['draft', 'sent', 'overdue', 'paid', 'cancelled']
    default:
      return ['draft', 'sent']
  }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Date du jour au format ISO (YYYY-MM-DD), dans le fuseau local. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '—'
  return DATE_FORMATTER.format(new Date(Date.UTC(y, m - 1, d)))
}

export function displayStatus(
  doc: Pick<SalesDocument, 'kind' | 'status' | 'valid_until' | 'due_date'>,
  today: string = todayIso(),
): SalesDisplayStatus {
  if (doc.kind === 'quote' && doc.status === 'sent' && doc.valid_until && doc.valid_until < today) {
    return 'expired'
  }
  if (doc.kind === 'invoice' && doc.status === 'sent' && doc.due_date && doc.due_date < today) {
    return 'overdue'
  }
  return doc.status
}

// ---------------------------------------------------------------------------
// Calculs (arithmétique entière : identique à numeric/round de PostgreSQL)
// ---------------------------------------------------------------------------

function toScaledBigInt(value: number, decimals: number): bigint {
  if (!Number.isFinite(value)) return 0n
  const fixed = value.toFixed(decimals)
  const negative = fixed.startsWith('-')
  const digits = fixed.replace('-', '').replace('.', '')
  const n = BigInt(digits)
  return negative ? -n : n
}

/** Division entière avec arrondi « half away from zero » (comme round() de Postgres). */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const q = (n * 2n + d) / (d * 2n)
  return negative ? -q : q
}

function centsToNumber(cents: bigint): number {
  return Number(cents) / 100
}

/** Arrondi au centime, demi vers l'extérieur. */
export function roundCents(value: number): number {
  return centsToNumber(divRound(toScaledBigInt(value, 6), 10_000n))
}

export type LineAmountInput = Pick<
  SalesDocumentLine,
  'quantity' | 'unit_price_ht' | 'discount_percent'
>

/** round(quantity * unit_price_ht * (1 - discount/100), 2) */
export function lineTotalCents(line: LineAmountInput): bigint {
  const qty = toScaledBigInt(Number(line.quantity) || 0, 3) // millièmes
  const price = toScaledBigInt(Number(line.unit_price_ht) || 0, 2) // centimes
  const discount = toScaledBigInt(Number(line.discount_percent) || 0, 2) // centièmes de %
  // centimes * millièmes * (10000 - remise) / (1000 * 10000)
  return divRound(qty * price * (10000n - discount), 1000n * 10000n)
}

export function lineTotalHt(line: LineAmountInput): number {
  return centsToNumber(lineTotalCents(line))
}

export type SalesTotals = {
  subtotalHt: number
  totalVat: number
  totalTtc: number
  breakdown: VatBreakdownRow[]
}

export function computeTotals(
  lines: Array<LineAmountInput & Pick<SalesDocumentLine, 'vat_rate'>>,
  vatExempt: boolean,
): SalesTotals {
  const byRate = new Map<string, { rate: number; base: bigint }>()
  for (const line of lines) {
    const rate = vatExempt ? 0 : Number(line.vat_rate) || 0
    const key = rate.toFixed(2)
    const entry = byRate.get(key) ?? { rate, base: 0n }
    entry.base += lineTotalCents(line)
    byRate.set(key, entry)
  }

  let ht = 0n
  let vat = 0n
  const breakdown: VatBreakdownRow[] = []
  for (const { rate, base } of [...byRate.values()].sort((a, b) => b.rate - a.rate)) {
    const rateHundredths = toScaledBigInt(rate, 2)
    const vatCents = divRound(base * rateHundredths, 10_000n)
    ht += base
    vat += vatCents
    breakdown.push({ rate, base: centsToNumber(base), vat: centsToNumber(vatCents) })
  }

  return {
    subtotalHt: centsToNumber(ht),
    totalVat: centsToNumber(vat),
    totalTtc: centsToNumber(ht + vat),
    breakdown,
  }
}

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

const MONEY_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Montant comptable (toujours 2 décimales, négatifs autorisés). */
export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return MONEY_FORMATTER.format(Number(value))
}

const RATE_FORMATTER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

export function formatVatRate(rate: number): string {
  return `${RATE_FORMATTER.format(rate)} %`
}

const QTY_FORMATTER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 })

export function formatQuantity(qty: number): string {
  return QTY_FORMATTER.format(qty)
}

/** Parse une saisie « 1 234,50 » ou « 1234.5 ». Renvoie NaN si invalide. */
export function parseDecimalInput(raw: string): number {
  const cleaned = raw.replace(/[\s\u00a0\u202f€%]/g, '').replace(',', '.')
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return NaN
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return NaN
  return Number(cleaned)
}

export function clientDisplayName(
  party:
    | { company_name?: string | null; first_name?: string | null; last_name?: string | null }
    | null
    | undefined,
): string {
  if (!party) return 'Client supprimé'
  const person = formatPersonName(party.first_name ?? '', party.last_name ?? '')
  return party.company_name?.trim() || person || 'Client'
}

export function documentFileName(doc: Pick<SalesDocument, 'kind' | 'number'>): string {
  const base = doc.number ?? `${KIND_LABELS[doc.kind].prefix}-brouillon`
  return `${base}.pdf`
}

export function documentHeading(doc: Pick<SalesDocument, 'kind' | 'number'>): string {
  const label = KIND_LABELS[doc.kind].singular
  return doc.number ? `${label} ${doc.number}` : label
}

// ---------------------------------------------------------------------------
// Mentions légales
// ---------------------------------------------------------------------------

export type LegalMentionsInput = {
  kind: SalesDocumentKind
  vatExempt: boolean
  vatExemptionReason: string | null
  dueDate: string | null
  validUntil: string | null
  paymentTerms: string | null
  latePenaltyRate: string | null
  /** Client professionnel (SIRET / société) : indemnité forfaitaire 40 € obligatoire. */
  clientIsBusiness: boolean
  sourceNumber?: string | null
}

export function buildLegalMentions(input: LegalMentionsInput): string[] {
  const mentions: string[] = []

  if (input.vatExempt) {
    mentions.push(input.vatExemptionReason?.trim() || DEFAULT_VAT_EXEMPTION_REASON)
  }

  if (input.kind === 'quote') {
    if (input.validUntil) {
      mentions.push(`Devis valable jusqu'au ${formatDateFr(input.validUntil)}.`)
    }
    if (input.paymentTerms?.trim()) mentions.push(input.paymentTerms.trim())
    return mentions
  }

  if (input.kind === 'credit_note') {
    if (input.sourceNumber) {
      mentions.push(`Avoir émis en annulation de la facture ${input.sourceNumber}.`)
    }
    return mentions
  }

  if (input.paymentTerms?.trim()) mentions.push(input.paymentTerms.trim())
  if (input.dueDate) mentions.push(`Date d'échéance : ${formatDateFr(input.dueDate)}.`)
  mentions.push("Pas d'escompte pour paiement anticipé.")
  const rate = input.latePenaltyRate?.trim() || DEFAULT_LATE_PENALTY_RATE
  mentions.push(`En cas de retard de paiement, des pénalités au taux de ${rate} sont exigibles.`)
  if (input.clientIsBusiness) {
    mentions.push(
      'Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 € (art. L441-10 du Code de commerce).',
    )
  }
  return mentions
}

/**
 * Forme juridique telle qu'elle doit apparaître sur un devis / une facture.
 * Un micro-entrepreneur doit faire figurer « EI » (loi du 14 février 2022).
 */
export function legalFormForDocuments(legalForm: string | null | undefined): string | null {
  const v = legalForm?.trim()
  if (!v) return null
  if (/^(auto|micro)[- ]?entrepreneur/i.test(v) || /^micro[- ]?entreprise$/i.test(v)) return 'EI'
  return v
}

/** Micro-entrepreneur sans n° de TVA : franchise en base proposée par défaut. */
export function suggestsVatExemption(issuer: { legal_form?: string | null; vat_number?: string | null } | null): boolean {
  if (!issuer) return false
  return legalFormForDocuments(issuer.legal_form) === 'EI' && !issuer.vat_number?.trim()
}

export function isBusinessParty(party: PartySnapshot | null | undefined): boolean {
  if (!party) return false
  return Boolean(party.company_name?.trim() || party.siret?.trim() || party.siren?.trim())
}

// ---------------------------------------------------------------------------
// Validation avant finalisation (le serveur revérifie)
// ---------------------------------------------------------------------------

export type DraftLineInput = {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price_ht: number
  vat_rate: number
  discount_percent: number
}

export type DraftIssue = { field: string; message: string; blocking: boolean }

export function validateLine(line: DraftLineInput): string | null {
  if (!line.description.trim()) return 'Description obligatoire.'
  if (line.description.length > 2000) return 'Description trop longue (2000 caractères max).'
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) return 'Quantité supérieure à 0.'
  if (line.quantity > 1_000_000) return 'Quantité trop élevée.'
  if (!Number.isFinite(line.unit_price_ht) || line.unit_price_ht < 0) return 'Prix unitaire invalide.'
  if (line.unit_price_ht > 10_000_000) return 'Prix unitaire trop élevé.'
  if (!VAT_RATES.includes(line.vat_rate as VatRate)) return 'Taux de TVA invalide.'
  if (
    !Number.isFinite(line.discount_percent) ||
    line.discount_percent < 0 ||
    line.discount_percent > 100
  ) {
    return 'Remise entre 0 et 100 %.'
  }
  return null
}

export type IssuerLegalInfo = {
  name: string | null
  siret: string | null
  address_street: string | null
  address_postal_code: string | null
  address_city: string | null
  vat_number: string | null
}

export function validateForFinalize(input: {
  kind: SalesDocumentKind
  clientId: string | null
  lines: DraftLineInput[]
  vatExempt: boolean
  issuer: IssuerLegalInfo | null
  totalTtc: number
  /** Adresse du client renseignée (mention obligatoire sur une facture). */
  clientHasAddress?: boolean
}): DraftIssue[] {
  const issues: DraftIssue[] = []
  if (!input.clientId) {
    issues.push({ field: 'client', message: 'Sélectionnez un client.', blocking: true })
  }
  if (input.lines.length === 0) {
    issues.push({ field: 'lines', message: 'Ajoutez au moins une ligne.', blocking: true })
  }
  input.lines.forEach((line, index) => {
    const error = validateLine(line)
    if (error) {
      issues.push({ field: `line-${line.id}`, message: `Ligne ${index + 1} : ${error}`, blocking: true })
    }
  })
  if (input.kind !== 'quote' && input.lines.length > 0 && input.totalTtc <= 0) {
    issues.push({ field: 'total', message: 'Le montant total doit être supérieur à zéro.', blocking: true })
  }

  if (input.clientId && input.kind !== 'quote' && input.clientHasAddress === false) {
    issues.push({
      field: 'client',
      message: 'Adresse du client manquante : elle est obligatoire sur une facture (complétez la fiche client).',
      blocking: false,
    })
  }

  const issuer = input.issuer
  if (!issuer?.siret?.trim()) {
    issues.push({
      field: 'issuer',
      message: 'Votre SIRET est manquant (Paramètres › Informations légales).',
      blocking: input.kind !== 'quote',
    })
  }
  if (!issuer?.address_street?.trim() || !issuer?.address_city?.trim()) {
    issues.push({
      field: 'issuer',
      message: 'Votre adresse est incomplète (Paramètres › Informations légales).',
      blocking: input.kind !== 'quote',
    })
  }
  if (!input.vatExempt && !issuer?.vat_number?.trim()) {
    issues.push({
      field: 'issuer',
      message:
        "Numéro de TVA intracommunautaire absent : ajoutez-le ou cochez « TVA non applicable » si vous êtes en franchise.",
      blocking: false,
    })
  }
  return issues
}

// ---------------------------------------------------------------------------
// Indicateurs
// ---------------------------------------------------------------------------

export type SalesKpis = {
  toCollect: number
  toCollectCount: number
  overdue: number
  overdueCount: number
  paidThisYear: number
  pendingQuotes: number
  pendingQuotesCount: number
  acceptedQuotesThisYear: number
  acceptanceRate: number | null
}

export function computeKpis(
  docs: Array<
    Pick<
      SalesDocument,
      'kind' | 'status' | 'total_ttc' | 'due_date' | 'valid_until' | 'paid_at' | 'issue_date'
    >
  >,
  today: string = todayIso(),
): SalesKpis {
  const year = today.slice(0, 4)
  const kpis: SalesKpis = {
    toCollect: 0,
    toCollectCount: 0,
    overdue: 0,
    overdueCount: 0,
    paidThisYear: 0,
    pendingQuotes: 0,
    pendingQuotesCount: 0,
    acceptedQuotesThisYear: 0,
    acceptanceRate: null,
  }
  let decided = 0
  let accepted = 0
  let paid = 0n
  let toCollect = 0n
  let overdue = 0n
  let pending = 0n
  let acceptedYear = 0n
  const cents = (n: number) => toScaledBigInt(Number(n) || 0, 2)

  for (const doc of docs) {
    const status = displayStatus(doc, today)
    if (doc.kind === 'invoice') {
      if (status === 'sent') {
        toCollect += cents(doc.total_ttc)
        kpis.toCollectCount++
      } else if (status === 'overdue') {
        toCollect += cents(doc.total_ttc)
        overdue += cents(doc.total_ttc)
        kpis.toCollectCount++
        kpis.overdueCount++
      } else if (status === 'paid' && doc.paid_at?.startsWith(year)) {
        paid += cents(doc.total_ttc)
      }
    } else if (doc.kind === 'quote') {
      if (status === 'sent') {
        pending += cents(doc.total_ttc)
        kpis.pendingQuotesCount++
      }
      if (doc.status === 'accepted' || doc.status === 'declined') {
        decided++
        if (doc.status === 'accepted') {
          accepted++
          if (doc.issue_date?.startsWith(year)) acceptedYear += cents(doc.total_ttc)
        }
      }
    }
  }

  kpis.toCollect = centsToNumber(toCollect)
  kpis.overdue = centsToNumber(overdue)
  kpis.paidThisYear = centsToNumber(paid)
  kpis.pendingQuotes = centsToNumber(pending)
  kpis.acceptedQuotesThisYear = centsToNumber(acceptedYear)
  kpis.acceptanceRate = decided > 0 ? Math.round((accepted / decided) * 100) : null
  return kpis
}

// ---------------------------------------------------------------------------
// Actions disponibles selon l'état
// ---------------------------------------------------------------------------

export type SalesAction =
  | 'save'
  | 'finalize'
  | 'delete'
  | 'mark_accepted'
  | 'mark_declined'
  | 'reopen'
  | 'convert'
  | 'open_invoice'
  | 'mark_paid'
  | 'unmark_paid'
  | 'credit_note'
  | 'open_credit_note'
  | 'open_source'
  | 'duplicate'
  | 'pdf'
  | 'email'

export function availableActions(
  doc: Pick<SalesDocument, 'kind' | 'status' | 'converted_invoice_id' | 'source_document_id'>,
  opts: { hasCreditNote?: boolean } = {},
): SalesAction[] {
  if (doc.status === 'draft') return ['save', 'finalize', 'pdf', 'delete']
  const actions: SalesAction[] = []
  if (doc.kind === 'quote') {
    if (doc.status === 'sent') actions.push('mark_accepted', 'mark_declined', 'convert')
    if (doc.status === 'accepted') {
      actions.push(doc.converted_invoice_id ? 'open_invoice' : 'convert')
      if (!doc.converted_invoice_id) actions.push('reopen')
    }
    if (doc.status === 'declined') actions.push('reopen')
    actions.push('pdf', 'email', 'duplicate', 'delete')
    return actions
  }
  if (doc.kind === 'invoice') {
    if (doc.status === 'sent') actions.push('mark_paid')
    if (doc.status === 'paid') actions.push('unmark_paid')
    if (doc.status === 'sent' || doc.status === 'paid') {
      actions.push(opts.hasCreditNote ? 'open_credit_note' : 'credit_note')
    }
    if (doc.status === 'cancelled') actions.push('open_credit_note')
    if (doc.source_document_id) actions.push('open_source')
    actions.push('pdf', 'email', 'duplicate')
    return actions
  }
  if (doc.source_document_id) actions.push('open_source')
  actions.push('pdf', 'email', 'duplicate')
  return actions
}

/** Lien mailto pré-rempli (le PDF est à joindre manuellement). */
export function buildMailtoLink(input: {
  to: string | null | undefined
  kind: SalesDocumentKind
  number: string | null
  totalTtc: number
  agencyName: string | null
  dueDate?: string | null
  validUntil?: string | null
}): string {
  const label = KIND_LABELS[input.kind].singular.toLowerCase()
  const article = input.kind === 'invoice' ? 'la' : 'le'
  const subject = `${KIND_LABELS[input.kind].singular} ${input.number ?? ''}`.trim() +
    (input.agencyName ? ` — ${input.agencyName}` : '')
  const lines = [
    'Bonjour,',
    '',
    `Veuillez trouver ci-joint ${article} ${label} ${input.number ?? ''} d'un montant de ${formatMoney(input.totalTtc)} TTC.`.replace(/\s+/g, ' '),
  ]
  if (input.kind === 'invoice' && input.dueDate) {
    lines.push(`Échéance de paiement : ${formatDateFr(input.dueDate)}.`)
  }
  if (input.kind === 'quote' && input.validUntil) {
    lines.push(`Ce devis est valable jusqu'au ${formatDateFr(input.validUntil)}.`)
  }
  lines.push('', 'Je reste à votre disposition pour toute question.', '', 'Cordialement,')
  if (input.agencyName) lines.push(input.agencyName)
  const body = lines.join('\n').replace(/[\u00a0\u202f]/g, ' ')
  return `mailto:${encodeURIComponent(input.to ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function newLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Repli (tests / vieux navigateurs) : UUID v4 pseudo-aléatoire.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function emptyLine(defaultVatRate: number, vatExempt: boolean): DraftLineInput {
  return {
    id: newLineId(),
    description: '',
    quantity: 1,
    unit: null,
    unit_price_ht: 0,
    vat_rate: vatExempt ? 0 : defaultVatRate,
    discount_percent: 0,
  }
}
