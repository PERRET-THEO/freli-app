import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Copy,
  Download,
  FileMinus2,
  FileText,
  Lock,
  Mail,
  Save,
  Send,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react'
import { DashboardLayout } from '../components/DashboardLayout'
import { ConfirmDialog } from '../components/sales/ConfirmDialog'
import { LineItemsEditor } from '../components/sales/LineItemsEditor'
import { newEditorLine, toDraftLine, toEditorLine, type EditorLine } from '../lib/salesEditorLines'
import { SalesDocumentReadOnly } from '../components/sales/SalesDocumentReadOnly'
import { SalesStatusBadge } from '../components/sales/SalesStatusBadge'
import { Card } from '../components/ui'
import { useAgencySession } from '../contexts/AgencyContext'
import { formatPersonName } from '../lib/formatPersonName'
import {
  addDaysIso,
  availableActions,
  buildMailtoLink,
  clientDisplayName,
  computeTotals,
  DEFAULT_VAT_EXEMPTION_REASON,
  displayStatus,
  documentFileName,
  documentHeading,
  formatDateFr,
  formatMoney,
  formatVatRate,
  KIND_LABELS,
  todayIso,
  validateForFinalize,
  type DraftIssue,
  type InvoicingSettings,
  type SalesAction,
  type SalesDocumentKind,
  type SalesTotals,
} from '../lib/salesDocuments'
import {
  convertQuoteToInvoice,
  createCreditNote,
  createSalesDocumentDraft,
  deleteSalesDocument,
  duplicateSalesDocument,
  finalizeSalesDocument,
  getAgencyIssuer,
  getInvoicingSettings,
  getSalesDocument,
  listClientOptions,
  listProjectOptions,
  saveSalesDocumentLines,
  setSalesDocumentStatus,
  updateSalesDocumentDraft,
  type AgencyIssuerRow,
  type ClientOption,
  type DraftHeaderInput,
  type ProjectOption,
  type SalesDocumentDetail,
} from '../lib/salesDocumentsApi'

type HeaderState = {
  clientId: string
  projectId: string
  title: string
  issueDate: string
  validUntil: string
  dueDate: string
  serviceDate: string
  notes: string
  paymentTerms: string
  vatExempt: boolean
  vatExemptionReason: string
}

type ConfirmState =
  | { action: 'finalize' | 'delete' | 'credit_note' | 'convert' | 'mark_paid' | 'leave'; to?: string }
  | null

const inputCls =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 font-body text-sm text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)]'
const labelCls = 'mb-1 block text-xs font-body font-medium text-[var(--ink-soft)]'

function kindFromParam(value: string | null): Exclude<SalesDocumentKind, 'credit_note'> {
  return value === 'facture' || value === 'invoice' ? 'invoice' : 'quote'
}

function defaultPaymentTerms(kind: SalesDocumentKind, settings: InvoicingSettings): string {
  if (kind !== 'invoice') return ''
  return settings.payment_terms_days === 0
    ? 'Paiement comptant à réception de facture.'
    : `Paiement à ${settings.payment_terms_days} jours à compter de la date d'émission.`
}

function headerToInput(h: HeaderState, kind: SalesDocumentKind): DraftHeaderInput {
  const blank = (v: string) => (v.trim() ? v.trim() : null)
  return {
    client_id: blank(h.clientId),
    project_id: blank(h.projectId),
    title: blank(h.title),
    issue_date: kind === 'quote' ? blank(h.issueDate) : null,
    valid_until: kind === 'quote' ? blank(h.validUntil) : null,
    due_date: kind === 'invoice' ? blank(h.dueDate) : null,
    service_date: kind === 'invoice' ? blank(h.serviceDate) : null,
    notes: blank(h.notes),
    payment_terms: blank(h.paymentTerms),
    vat_exempt: h.vatExempt,
    vat_exemption_reason: h.vatExempt ? blank(h.vatExemptionReason) ?? DEFAULT_VAT_EXEMPTION_REASON : null,
  }
}

function snapshotOf(h: HeaderState, lines: EditorLine[]) {
  return JSON.stringify({ h, lines })
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  variant = 'secondary',
  disabled,
  testId,
  size = 'md',
  title,
}: {
  icon: typeof Save
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  testId?: string
  size?: 'md' | 'sm'
  title?: string
}) {
  const cls =
    variant === 'primary'
      ? 'bg-[var(--accent)] text-[var(--white)] hover:brightness-95'
      : variant === 'danger'
        ? 'border border-[var(--border)] bg-[var(--white)] text-[#c2410c] hover:border-[#c2410c]'
        : 'border border-[var(--border)] bg-[var(--white)] text-[var(--ink)] hover:border-[var(--accent)]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      title={title}
      className={`inline-flex w-full items-center justify-center rounded-[var(--radius-sm)] font-body font-medium ${size === 'sm' ? 'gap-1.5 px-2 py-2 text-xs' : 'gap-2 px-3 py-2.5 text-sm'} transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )
}

export function SalesDocumentEditor() {
  const { id } = useParams()
  const isNew = !id
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { agency, loading: sessionLoading } = useAgencySession()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [detail, setDetail] = useState<SalesDocumentDetail | null>(null)
  const [kind, setKind] = useState<SalesDocumentKind>(() => kindFromParam(searchParams.get('type')))
  const [header, setHeader] = useState<HeaderState | null>(null)
  const [lines, setLines] = useState<EditorLine[]>([])
  const [savedLineIds, setSavedLineIds] = useState<string[]>([])
  const [baseline, setBaseline] = useState('')
  const [clients, setClients] = useState<ClientOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [settings, setSettings] = useState<InvoicingSettings | null>(null)
  const [issuer, setIssuer] = useState<AgencyIssuerRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<DraftIssue[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [today] = useState(() => todayIso())
  const loadSeq = useRef(0)
  /** Rechargement sans squelette (après une action) : évite le flash de l'écran. */
  const silentReload = useRef(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2400)
  }, [])

  const doc = detail?.document ?? null
  const readOnly = Boolean(doc && doc.status !== 'draft')

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!agency?.id) return
    const seq = ++loadSeq.current
    const silent = silentReload.current
    silentReload.current = false
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [s, iss, cl] = await Promise.all([
        getInvoicingSettings(agency.id),
        getAgencyIssuer(agency.id),
        listClientOptions(agency.id),
      ])
      if (seq !== loadSeq.current) return
      setSettings(s)
      setIssuer(iss)
      setClients(cl)

      if (id) {
        const d = await getSalesDocument(id)
        if (seq !== loadSeq.current) return
        if (!d) {
          setNotFound(true)
          setLoading(false)
          return
        }
        setNotFound(false)
        setDetail(d)
        setKind(d.document.kind)
        const h: HeaderState = {
          clientId: d.document.client_id ?? '',
          projectId: d.document.project_id ?? '',
          title: d.document.title ?? '',
          issueDate: d.document.issue_date ?? '',
          validUntil: d.document.valid_until ?? '',
          dueDate: d.document.due_date ?? '',
          serviceDate: d.document.service_date ?? '',
          notes: d.document.notes ?? '',
          paymentTerms: d.document.payment_terms ?? '',
          vatExempt: d.document.vat_exempt,
          vatExemptionReason: d.document.vat_exemption_reason ?? '',
        }
        const ls = d.lines.map((l) => toEditorLine({ ...l, unit: l.unit }))
        setHeader(h)
        setLines(ls)
        setSavedLineIds(d.lines.map((l) => l.id))
        setBaseline(snapshotOf(h, ls))
      } else {
        const k = kindFromParam(searchParams.get('type'))
        const clientParam = searchParams.get('client') ?? ''
        const projectParam = searchParams.get('projet') ?? ''
        const validClient = cl.some((c) => c.id === clientParam) ? clientParam : ''
        const h: HeaderState = {
          clientId: validClient,
          projectId: validClient ? projectParam : '',
          title: '',
          issueDate: today,
          validUntil: addDaysIso(today, s.quote_validity_days),
          dueDate: addDaysIso(today, s.payment_terms_days),
          serviceDate: '',
          notes: '',
          paymentTerms: defaultPaymentTerms(k, s),
          vatExempt: s.vat_exempt,
          vatExemptionReason: s.vat_exempt ? s.vat_exemption_reason ?? DEFAULT_VAT_EXEMPTION_REASON : '',
        }
        const ls = [newEditorLine(s.vat_exempt ? 0 : s.default_vat_rate)]
        setKind(k)
        setDetail(null)
        setHeader(h)
        setLines(ls)
        setSavedLineIds([])
        setBaseline(snapshotOf(h, ls))
      }
    } catch (e) {
      if (seq === loadSeq.current) setError((e as Error).message)
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [agency?.id, id, searchParams, today])

  useEffect(() => {
    if (sessionLoading) return
    if (!agency?.id) {
      setLoading(false)
      return
    }
    void load()
  }, [load, sessionLoading, agency?.id])

  // Projets du client sélectionné
  const clientId = header?.clientId ?? ''
  useEffect(() => {
    let cancelled = false
    if (!clientId) {
      setProjects([])
      return
    }
    listProjectOptions(clientId)
      .then((p) => {
        if (cancelled) return
        setProjects(p)
      })
      .catch(() => !cancelled && setProjects([]))
    return () => {
      cancelled = true
    }
  }, [clientId])

  // Pré-remplissage depuis un projet (nouveau document uniquement)
  const prefilledProject = useRef(false)
  useEffect(() => {
    if (!isNew || prefilledProject.current || !header?.projectId) return
    const p = projects.find((x) => x.id === header.projectId)
    if (!p) return
    prefilledProject.current = true
    setHeader((h) => (h && !h.title ? { ...h, title: p.name } : h))
    setLines((ls) =>
      ls.length === 1 && !ls[0].description ? [{ ...ls[0], description: p.name }] : ls,
    )
  }, [isNew, header?.projectId, projects])

  const dirty = header ? snapshotOf(header, lines) !== baseline : false

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // ---------------------------------------------------------------------------
  // Dérivés
  // ---------------------------------------------------------------------------
  const draftLines = useMemo(() => lines.map(toDraftLine), [lines])
  const liveTotals: SalesTotals = useMemo(() => {
    if (doc && readOnly) {
      return {
        subtotalHt: doc.subtotal_ht,
        totalVat: doc.total_vat,
        totalTtc: doc.total_ttc,
        breakdown: doc.vat_breakdown,
      }
    }
    const valid = draftLines.filter(
      (l) => Number.isFinite(l.quantity) && Number.isFinite(l.unit_price_ht) && Number.isFinite(l.discount_percent),
    )
    return computeTotals(valid, header?.vatExempt ?? false)
  }, [doc, readOnly, draftLines, header?.vatExempt])

  const selectedClient = clients.find((c) => c.id === header?.clientId) ?? null
  const status = doc ? displayStatus(doc, today) : 'draft'
  const actions: SalesAction[] = doc
    ? availableActions(doc, { hasCreditNote: Boolean(detail?.creditNoteId) })
    : ['save', 'finalize', 'pdf']

  const patchHeader = (p: Partial<HeaderState>) => setHeader((h) => (h ? { ...h, ...p } : h))

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message || 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  /** Enregistre le brouillon ; renvoie l'id (création si nécessaire). */
  const persist = async (): Promise<string> => {
    if (!agency?.id || !header) throw new Error('Agence introuvable.')
    // Les lignes totalement vides (ni désignation ni prix) sont ignorées.
    const keptLines = lines.filter((l) => l.description.trim() || l.unit_price_ht.trim())
    const kept = keptLines.map(toDraftLine)
    const lineErrors = kept.some(
      (l) => !Number.isFinite(l.quantity) || !Number.isFinite(l.unit_price_ht) || !Number.isFinite(l.discount_percent),
    )
    if (lineErrors) {
      setShowErrors(true)
      throw new Error('Corrigez les montants invalides avant d’enregistrer.')
    }
    if (kept.some((l) => !l.description.trim())) {
      setShowErrors(true)
      throw new Error('Chaque ligne doit avoir une désignation.')
    }
    const input = headerToInput(header, kind)
    let docId = id
    if (!docId) {
      docId = await createSalesDocumentDraft(agency.id, kind === 'credit_note' ? 'invoice' : kind, input)
    } else {
      await updateSalesDocumentDraft(docId, input)
    }
    await saveSalesDocumentLines(docId, agency.id, kept, savedLineIds)
    setSavedLineIds(kept.map((l) => l.id))
    setLines(keptLines)
    setBaseline(snapshotOf(header, keptLines))
    return docId
  }

  const onSave = () =>
    run('save', async () => {
      const docId = await persist()
      if (isNew) {
        silentReload.current = true
        navigate(`/dashboard/documents/${docId}`, { replace: true })
      } else {
        silentReload.current = true
        await load()
      }
      showToast('Brouillon enregistré')
    })

  const requestFinalize = () => {
    if (!header) return
    const found = validateForFinalize({
      kind,
      clientId: header.clientId || null,
      lines: lines.filter((l) => l.description.trim() || l.unit_price_ht.trim()).map(toDraftLine),
      vatExempt: header.vatExempt,
      issuer,
      totalTtc: liveTotals.totalTtc,
      clientHasAddress: Boolean(selectedClient?.address_street?.trim() && selectedClient?.address_city?.trim()),
    })
    setIssues(found)
    setShowErrors(true)
    if (found.some((i) => i.blocking)) {
      setError('Le document ne peut pas encore être finalisé : voir les points à corriger.')
      return
    }
    setError(null)
    setConfirm({ action: 'finalize' })
  }

  const doFinalize = () =>
    run('finalize', async () => {
      const docId = await persist()
      await finalizeSalesDocument(docId)
      setConfirm(null)
      setIssues([])
      silentReload.current = true
      if (isNew) navigate(`/dashboard/documents/${docId}`, { replace: true })
      else await load()
      showToast(
        kind === 'quote'
          ? 'Devis finalisé et numéroté'
          : kind === 'invoice'
            ? 'Facture émise et numérotée'
            : 'Avoir émis : la facture d’origine est annulée',
      )
    })

  const doStatus = (next: 'accepted' | 'declined' | 'sent' | 'paid', message: string) =>
    run(next, async () => {
      if (!doc) return
      await setSalesDocumentStatus(doc.id, next)
      setConfirm(null)
      silentReload.current = true
      await load()
      showToast(message)
    })

  const doConvert = () =>
    run('convert', async () => {
      if (!doc) return
      const invoiceId = await convertQuoteToInvoice(doc.id)
      setConfirm(null)
      navigate(`/dashboard/documents/${invoiceId}`)
      showToast('Facture brouillon créée depuis le devis')
    })

  const doCreditNote = () =>
    run('credit_note', async () => {
      if (!doc) return
      const creditId = await createCreditNote(doc.id)
      setConfirm(null)
      navigate(`/dashboard/documents/${creditId}`)
      showToast('Avoir brouillon créé')
    })

  const doDuplicate = () =>
    run('duplicate', async () => {
      if (!doc) return
      const newId = await duplicateSalesDocument(doc.id)
      navigate(`/dashboard/documents/${newId}`)
      showToast('Copie créée en brouillon')
    })

  const doDelete = () =>
    run('delete', async () => {
      if (!doc) return
      await deleteSalesDocument(doc.id)
      setConfirm(null)
      navigate(
        `/dashboard/documents?onglet=${doc.kind === 'quote' ? 'devis' : doc.kind === 'invoice' ? 'factures' : 'avoirs'}`,
        { replace: true },
      )
    })

  const doPdf = () =>
    run('pdf', async () => {
      if (!header) return
      const { buildSalesDocumentPdf, downloadPdf, loadLogoForPdf, pdfInputFromDocument } = await import(
        '../lib/salesDocumentPdf'
      )
      const pdfLines = readOnly
        ? (detail?.lines ?? [])
        : draftLines.filter((l) => Number.isFinite(l.quantity) && Number.isFinite(l.unit_price_ht))
      const base = headerToInput(header, kind)
      const pdfInput = pdfInputFromDocument({
        document: {
          kind,
          status: doc?.status ?? 'draft',
          number: doc?.number ?? null,
          title: readOnly ? doc?.title ?? null : base.title,
          issue_date: readOnly ? doc?.issue_date ?? null : base.issue_date,
          valid_until: readOnly ? doc?.valid_until ?? null : base.valid_until,
          due_date: readOnly ? doc?.due_date ?? null : base.due_date,
          service_date: readOnly ? doc?.service_date ?? null : base.service_date,
          notes: readOnly ? doc?.notes ?? null : base.notes,
          payment_terms: readOnly ? doc?.payment_terms ?? null : base.payment_terms,
          vat_exempt: readOnly ? doc?.vat_exempt ?? false : base.vat_exempt,
          vat_exemption_reason: readOnly ? doc?.vat_exemption_reason ?? null : base.vat_exemption_reason,
          issuer_snapshot: doc?.issuer_snapshot ?? null,
          client_snapshot: doc?.client_snapshot ?? null,
        },
        lines: pdfLines,
        totals: liveTotals,
        sourceNumber: detail?.sourceNumber ?? null,
        currentIssuer: issuer ? { ...issuer } : null,
        currentClient: selectedClient ? { ...selectedClient } : null,
        settings,
      })
      pdfInput.logoPng = await loadLogoForPdf(pdfInput.logoUrl ?? issuer?.logo_url)
      const bytes = await buildSalesDocumentPdf(pdfInput)
      downloadPdf(bytes, documentFileName({ kind, number: doc?.number ?? null }))
    })

  const goTo = (to: string) => {
    if (dirty && !readOnly) setConfirm({ action: 'leave', to })
    else navigate(to)
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------
  const backTo = `/dashboard/documents?onglet=${kind === 'quote' ? 'devis' : kind === 'invoice' ? 'factures' : 'avoirs'}`

  if (!sessionLoading && !agency?.id) {
    return (
      <DashboardLayout maxWidth="5xl">
        <Card className="py-14 text-center">
          <p className="text-sm text-[var(--ink)]">Agence non configurée.</p>
        </Card>
      </DashboardLayout>
    )
  }

  if (notFound) {
    return (
      <DashboardLayout maxWidth="5xl">
        <Card className="py-14 text-center">
          <h1 className="font-display text-2xl font-semibold text-[var(--ink)]">Document introuvable</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">Il a peut-être été supprimé.</p>
          <Link to="/dashboard/documents" className="mt-5 inline-block text-sm font-medium text-[var(--accent)] underline">
            Retour aux devis &amp; factures
          </Link>
        </Card>
      </DashboardLayout>
    )
  }

  if (loading || !header) {
    return (
      <DashboardLayout maxWidth="7xl">
        <div className="animate-pulse space-y-4" aria-busy="true">
          <div className="h-8 w-64 rounded bg-[var(--surface-warm)]" />
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="h-96 rounded-[var(--radius-md)] bg-[var(--surface-warm)]" />
            <div className="h-64 rounded-[var(--radius-md)] bg-[var(--surface-warm)]" />
          </div>
          {error ? <p className="text-sm text-[#c2410c]">{error}</p> : null}
        </div>
      </DashboardLayout>
    )
  }

  const heading = doc ? documentHeading(doc) : KIND_LABELS[kind].newLabel
  const blockingIssues = issues.filter((i) => i.blocking)
  const warnings = issues.filter((i) => !i.blocking)

  return (
    <DashboardLayout maxWidth="7xl">
      <div className="space-y-5">
        <div>
          <button
            type="button"
            onClick={() => goTo(backTo)}
            className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded px-1 text-sm font-body text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" /> {KIND_LABELS[kind].plural}
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl" data-testid="doc-heading">
              {heading}
            </h1>
            <SalesStatusBadge kind={kind} status={status} />
            {readOnly ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--ink-muted)]">
                <Lock className="h-3.5 w-3.5" /> Verrouillé
              </span>
            ) : dirty ? (
              <span className="text-xs text-[var(--ink-muted)]">Modifications non enregistrées</span>
            ) : null}
          </div>
          {doc?.finalized_at ? (
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Émis le {formatDateFr(doc.issue_date)}
              {doc.paid_at ? ` · payée le ${formatDateFr(doc.paid_at)}` : ''}
              {doc.accepted_at ? ` · accepté le ${formatDateFr(doc.accepted_at)}` : ''}
              {doc.declined_at ? ` · refusé le ${formatDateFr(doc.declined_at)}` : ''}
              {doc.cancelled_at ? ` · annulée le ${formatDateFr(doc.cancelled_at)}` : ''}
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-[var(--radius-sm)] border border-[#f5c2b3] bg-[#fdecec] px-4 py-3 text-sm text-[#9a3412]" role="alert">
            {error}
            {blockingIssues.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {blockingIssues.map((i) => (
                  <li key={i.field + i.message}>{i.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-5">
            {readOnly && doc ? (
              <SalesDocumentReadOnly
                document={doc}
                lines={detail?.lines ?? []}
                projectName={projects.find((p) => p.id === doc.project_id)?.name ?? null}
                sourceNumber={detail?.sourceNumber ?? null}
              />
            ) : (
              <>
            {/* Client & dates */}
            <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
              <h2 className="font-display text-base font-semibold text-[var(--ink)]">Client &amp; informations</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="doc-client">
                    Client
                  </label>
                  {readOnly ? (
                    <p className="text-sm text-[var(--ink)]">
                      {clientDisplayName(doc?.client_snapshot ?? selectedClient)}
                      {doc?.client_id ? (
                        <Link to={`/dashboard/client/${doc.client_id}`} className="ml-2 text-xs text-[var(--accent)] underline">
                          Voir la fiche
                        </Link>
                      ) : null}
                    </p>
                  ) : (
                    <>
                      <select
                        id="doc-client"
                        className={inputCls}
                        value={header.clientId}
                        disabled={kind === 'credit_note'}
                        aria-invalid={showErrors && !header.clientId ? true : undefined}
                        onChange={(e) => patchHeader({ clientId: e.target.value, projectId: '' })}
                      >
                        <option value="">Sélectionner un client…</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {clientDisplayName(c)}
                            {c.company_name ? ` — ${formatPersonName(c.first_name, c.last_name)}` : ''} ({c.email})
                          </option>
                        ))}
                      </select>
                      {clients.length === 0 ? (
                        <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
                          Aucun client. <Link to="/dashboard/new" className="text-[var(--accent)] underline">Créez un projet</Link>{' '}
                          pour ajouter votre premier client.
                        </p>
                      ) : null}
                    </>
                  )}
                  {selectedClient && !readOnly ? (
                    <div className="mt-2 rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--ink-soft)]">
                      <p>{selectedClient.email}</p>
                      <p>
                        {[selectedClient.address_street, selectedClient.address_postal_code, selectedClient.address_city]
                          .filter(Boolean)
                          .join(' ') || (
                          <span className="text-[var(--status-action)]">
                            Adresse manquante — à compléter sur la{' '}
                            <Link to={`/dashboard/client/${selectedClient.id}`} className="underline">
                              fiche client
                            </Link>
                          </span>
                        )}
                      </p>
                      {selectedClient.siret ? <p>SIRET {selectedClient.siret}</p> : null}
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className={labelCls} htmlFor="doc-project">
                    Projet lié (optionnel)
                  </label>
                  <select
                    id="doc-project"
                    className={inputCls}
                    value={header.projectId}
                    disabled={readOnly || !header.clientId || kind === 'credit_note'}
                    onChange={(e) => patchHeader({ projectId: e.target.value })}
                  >
                    <option value="">Aucun</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {header.projectId && !projects.some((p) => p.id === header.projectId) ? (
                      <option value={header.projectId}>Projet lié</option>
                    ) : null}
                  </select>
                  {header.projectId && kind === 'quote' && !readOnly ? (
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      Une fois accepté, ce devis fixe le prix du projet. Le paiement en ligne du
                      client génère alors la facture automatiquement.
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className={labelCls} htmlFor="doc-title">
                    Objet
                  </label>
                  <input
                    id="doc-title"
                    className={inputCls}
                    value={header.title}
                    maxLength={200}
                    disabled={readOnly}
                    placeholder="Ex. Refonte du site internet"
                    onChange={(e) => patchHeader({ title: e.target.value })}
                  />
                </div>

                {kind === 'quote' ? (
                  <>
                    <div>
                      <label className={labelCls} htmlFor="doc-issue">
                        Date du devis
                      </label>
                      <input
                        id="doc-issue"
                        type="date"
                        className={inputCls}
                        value={header.issueDate}
                        disabled={readOnly}
                        onChange={(e) => patchHeader({ issueDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="doc-valid">
                        Valable jusqu’au
                      </label>
                      <input
                        id="doc-valid"
                        type="date"
                        className={inputCls}
                        value={header.validUntil}
                        min={header.issueDate || undefined}
                        disabled={readOnly}
                        onChange={(e) => patchHeader({ validUntil: e.target.value })}
                      />
                    </div>
                  </>
                ) : null}

                {kind === 'invoice' ? (
                  <>
                    <div>
                      <span className={labelCls}>Date d’émission</span>
                      <p className="py-2 text-sm text-[var(--ink)]">
                        {readOnly ? formatDateFr(doc?.issue_date) : 'Date du jour à la finalisation'}
                      </p>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="doc-due">
                        Échéance de paiement
                      </label>
                      <input
                        id="doc-due"
                        type="date"
                        className={inputCls}
                        value={header.dueDate}
                        min={today}
                        disabled={readOnly}
                        onChange={(e) => patchHeader({ dueDate: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="doc-service">
                        Date ou période de la prestation
                      </label>
                      <input
                        id="doc-service"
                        className={inputCls}
                        value={header.serviceDate}
                        maxLength={120}
                        disabled={readOnly}
                        placeholder="Ex. Octobre 2026"
                        onChange={(e) => patchHeader({ serviceDate: e.target.value })}
                      />
                    </div>
                  </>
                ) : null}

                {kind === 'credit_note' && detail?.sourceNumber ? (
                  <div className="sm:col-span-2 text-sm text-[var(--ink-soft)]">
                    Avoir sur la facture{' '}
                    <Link to={`/dashboard/documents/${doc?.source_document_id}`} className="font-medium text-[var(--accent)] underline">
                      {detail.sourceNumber}
                    </Link>
                    . Son émission annulera cette facture (le client et le projet sont repris de la facture).
                  </div>
                ) : null}
              </div>
            </section>

            {/* Lignes */}
            <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-[var(--ink)]">Prestations</h2>
                <label className="inline-flex items-center gap-2 text-xs text-[var(--ink-soft)]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent)]"
                    checked={header.vatExempt}
                    disabled={readOnly}
                    onChange={(e) =>
                      patchHeader({
                        vatExempt: e.target.checked,
                        vatExemptionReason:
                          e.target.checked && !header.vatExemptionReason
                            ? settings?.vat_exemption_reason ?? DEFAULT_VAT_EXEMPTION_REASON
                            : header.vatExemptionReason,
                      })
                    }
                  />
                  TVA non applicable
                </label>
              </div>
              {header.vatExempt ? (
                <input
                  aria-label="Mention d'exonération de TVA"
                  className={`${inputCls} mb-3 text-xs`}
                  value={header.vatExemptionReason}
                  maxLength={300}
                  disabled={readOnly}
                  onChange={(e) => patchHeader({ vatExemptionReason: e.target.value })}
                />
              ) : null}
              <LineItemsEditor
                lines={lines}
                onChange={setLines}
                readOnly={readOnly}
                vatExempt={header.vatExempt}
                defaultVatRate={settings?.default_vat_rate ?? 20}
                showErrors={showErrors}
              />
            </section>

            {/* Conditions & notes */}
            <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
              <h2 className="font-display text-base font-semibold text-[var(--ink)]">Conditions &amp; notes</h2>
              <div className="mt-4 grid gap-4">
                <div>
                  <label className={labelCls} htmlFor="doc-terms">
                    Conditions de paiement
                  </label>
                  <textarea
                    id="doc-terms"
                    rows={2}
                    className={inputCls}
                    value={header.paymentTerms}
                    maxLength={500}
                    disabled={readOnly}
                    placeholder={kind === 'quote' ? 'Ex. Acompte de 30 % à la signature, solde à la livraison.' : ''}
                    onChange={(e) => patchHeader({ paymentTerms: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="doc-notes">
                    Notes (visibles sur le document)
                  </label>
                  <textarea
                    id="doc-notes"
                    rows={3}
                    className={inputCls}
                    value={header.notes}
                    maxLength={4000}
                    disabled={readOnly}
                    onChange={(e) => patchHeader({ notes: e.target.value })}
                  />
                </div>
                {kind === 'invoice' ? (
                  <p className="text-xs text-[var(--ink-muted)]">
                    Les mentions obligatoires (pénalités de retard, indemnité forfaitaire de 40 € pour les
                    professionnels, absence d’escompte) sont ajoutées automatiquement au PDF.
                  </p>
                ) : null}
              </div>
            </section>
                        </>
            )}
          </div>

          {/* Colonne latérale */}
          <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4" aria-label="Totaux">
              <dl className="space-y-1.5 text-sm font-body">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--ink-muted)]">Total HT</dt>
                  <dd className="tabular-nums text-[var(--ink)]" data-testid="total-ht">
                    {formatMoney(liveTotals.subtotalHt)}
                  </dd>
                </div>
                {header.vatExempt ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--ink-muted)]">TVA</dt>
                    <dd className="tabular-nums text-[var(--ink)]">Non applicable</dd>
                  </div>
                ) : (
                  liveTotals.breakdown.map((b) => (
                    <div key={b.rate} className="flex justify-between gap-3">
                      <dt className="text-[var(--ink-muted)]">TVA {formatVatRate(b.rate)}</dt>
                      <dd className="tabular-nums text-[var(--ink)]">{formatMoney(b.vat)}</dd>
                    </div>
                  ))
                )}
                <div className="mt-2 flex justify-between gap-3 border-t border-[var(--border)] pt-2">
                  <dt className="font-semibold text-[var(--ink)]">
                    {kind === 'credit_note' ? 'Montant de l’avoir' : 'Total TTC'}
                  </dt>
                  <dd className="font-display text-lg font-bold tabular-nums text-[var(--ink)]" data-testid="total-ttc">
                    {formatMoney(liveTotals.totalTtc)}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4" aria-label="Actions">
              {actions.includes('save') ? (
                <ActionButton icon={Save} label={busy === 'save' ? 'Enregistrement…' : 'Enregistrer le brouillon'} onClick={() => void onSave()} disabled={Boolean(busy)} testId="action-save" />
              ) : null}
              {actions.includes('finalize') ? (
                <ActionButton
                  icon={Send}
                  variant="primary"
                  label={kind === 'quote' ? 'Finaliser le devis' : kind === 'invoice' ? 'Émettre la facture' : 'Émettre l’avoir'}
                  onClick={requestFinalize}
                  disabled={Boolean(busy)}
                  testId="action-finalize"
                />
              ) : null}
              {actions.includes('mark_accepted') ? (
                <ActionButton icon={CheckCircle2} variant="primary" label="Marquer accepté" onClick={() => void doStatus('accepted', 'Devis accepté')} disabled={Boolean(busy)} testId="action-accept" />
              ) : null}
              {actions.includes('convert') ? (
                <ActionButton icon={FileText} variant={doc?.status === 'accepted' ? 'primary' : 'secondary'} label="Convertir en facture" onClick={() => setConfirm({ action: 'convert' })} disabled={Boolean(busy)} testId="action-convert" />
              ) : null}
              {actions.includes('open_invoice') && doc?.converted_invoice_id ? (
                <ActionButton icon={FileText} label={`Voir la facture${detail?.convertedInvoiceNumber ? ` ${detail.convertedInvoiceNumber}` : ''}`} onClick={() => navigate(`/dashboard/documents/${doc.converted_invoice_id}`)} />
              ) : null}
              {actions.includes('mark_declined') ? (
                <ActionButton icon={XCircle} label="Marquer refusé" onClick={() => void doStatus('declined', 'Devis marqué refusé')} disabled={Boolean(busy)} testId="action-decline" />
              ) : null}
              {actions.includes('reopen') ? (
                <ActionButton icon={Undo2} label="Remettre en attente" onClick={() => void doStatus('sent', 'Devis remis en attente')} disabled={Boolean(busy)} />
              ) : null}
              {actions.includes('mark_paid') ? (
                <ActionButton icon={Banknote} variant="primary" label="Marquer payée" onClick={() => setConfirm({ action: 'mark_paid' })} disabled={Boolean(busy)} testId="action-paid" />
              ) : null}
              {actions.includes('unmark_paid') ? (
                <ActionButton icon={Undo2} label="Annuler le paiement" onClick={() => void doStatus('sent', 'Paiement annulé')} disabled={Boolean(busy)} />
              ) : null}
              {actions.includes('credit_note') ? (
                <ActionButton icon={FileMinus2} label="Créer un avoir" onClick={() => setConfirm({ action: 'credit_note' })} disabled={Boolean(busy)} testId="action-credit" />
              ) : null}
              {actions.includes('open_credit_note') && detail?.creditNoteId ? (
                <ActionButton icon={FileMinus2} label="Voir l’avoir" onClick={() => navigate(`/dashboard/documents/${detail.creditNoteId}`)} />
              ) : null}
              {actions.includes('open_source') && doc?.source_document_id ? (
                <ActionButton
                  icon={FileText}
                  label={`${kind === 'credit_note' ? 'Facture d’origine' : 'Devis d’origine'}${detail?.sourceNumber ? ` ${detail.sourceNumber}` : ''}`}
                  onClick={() => navigate(`/dashboard/documents/${doc.source_document_id}`)}
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3">
              {actions.includes('pdf') ? (
                <ActionButton size="sm" icon={Download} label={doc?.status === 'draft' || !doc ? 'Aperçu PDF' : 'PDF'} title={doc?.status === 'draft' || !doc ? 'Aperçu PDF (filigrane brouillon)' : 'Télécharger le PDF'} onClick={() => void doPdf()} disabled={Boolean(busy)} testId="action-pdf" />
              ) : null}
              {actions.includes('email') && doc ? (
                <a
                  href={buildMailtoLink({
                    to: (doc.client_snapshot?.email as string | undefined) ?? selectedClient?.email,
                    kind,
                    number: doc.number,
                    totalTtc: doc.total_ttc,
                    agencyName: (doc.issuer_snapshot?.name as string | undefined) ?? issuer?.name ?? null,
                    dueDate: doc.due_date,
                    validUntil: doc.valid_until,
                  })}
                  title="Ouvre votre messagerie avec un e-mail pré-rempli (joignez le PDF)"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-2 py-2 text-xs font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <Mail className="h-4 w-4" aria-hidden /> E-mail
                </a>
              ) : null}
              {actions.includes('duplicate') ? (
                <ActionButton size="sm" icon={Copy} label="Dupliquer" onClick={() => void doDuplicate()} disabled={Boolean(busy)} testId="action-duplicate" />
              ) : null}
              {actions.includes('delete') && doc ? (
                <ActionButton size="sm" icon={Trash2} variant="danger" label="Supprimer" onClick={() => setConfirm({ action: 'delete' })} disabled={Boolean(busy)} testId="action-delete" />
              ) : null}
              </div>
            </section>

            {warnings.length > 0 && !readOnly ? (
              <section className="rounded-[var(--radius-md)] border border-[var(--status-blocked-border)] bg-[var(--status-blocked-soft)] p-3 text-xs text-[var(--status-blocked)]">
                <ul className="list-disc space-y-1 pl-4">
                  {warnings.map((w) => (
                    <li key={w.message}>{w.message}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!readOnly ? (
              <p className="px-1 text-xs text-[var(--ink-muted)]">
                {kind === 'invoice'
                  ? 'À l’émission, la facture reçoit un numéro définitif (FAC\u2011année\u2011n°) et ne peut plus être modifiée ni supprimée : toute correction passe par un avoir.'
                  : kind === 'quote'
                    ? 'À la finalisation, le devis reçoit un numéro (DEV\u2011année\u2011n°) et son contenu est figé.'
                    : 'À l’émission, l’avoir est numéroté (AV\u2011année\u2011n°) et la facture d’origine est annulée.'}
              </p>
            ) : null}
          </aside>
        </div>
      </div>

      {confirm?.action === 'finalize' ? (
        <ConfirmDialog
          title={kind === 'quote' ? 'Finaliser ce devis ?' : kind === 'invoice' ? 'Émettre cette facture ?' : 'Émettre cet avoir ?'}
          confirmLabel={kind === 'quote' ? 'Finaliser' : 'Émettre'}
          busy={busy === 'finalize'}
          onConfirm={() => void doFinalize()}
          onCancel={() => setConfirm(null)}
        >
          <p>
            Montant : <strong className="text-[var(--ink)]">{formatMoney(liveTotals.totalTtc)} TTC</strong> pour{' '}
            <strong className="text-[var(--ink)]">{clientDisplayName(selectedClient)}</strong>.
          </p>
          <p>
            Un numéro définitif sera attribué et le contenu sera verrouillé.
            {kind === 'invoice' ? ' La facture ne pourra plus être supprimée.' : ''}
            {kind === 'credit_note' && detail?.sourceNumber ? ` La facture ${detail.sourceNumber} sera annulée.` : ''}
          </p>
          {warnings.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-[var(--status-blocked)]">
              {warnings.map((w) => (
                <li key={w.message}>{w.message}</li>
              ))}
            </ul>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {confirm?.action === 'convert' ? (
        <ConfirmDialog
          title="Convertir en facture ?"
          confirmLabel="Créer la facture"
          busy={busy === 'convert'}
          onConfirm={() => void doConvert()}
          onCancel={() => setConfirm(null)}
        >
          <p>Une facture brouillon reprenant les lignes du devis sera créée. Le devis sera marqué accepté.</p>
        </ConfirmDialog>
      ) : null}

      {confirm?.action === 'mark_paid' ? (
        <ConfirmDialog
          title="Marquer la facture payée ?"
          confirmLabel="Marquer payée"
          busy={busy === 'paid'}
          onConfirm={() => void doStatus('paid', 'Facture marquée payée')}
          onCancel={() => setConfirm(null)}
        >
          <p>
            Confirmez la réception de <strong className="text-[var(--ink)]">{formatMoney(doc?.total_ttc)}</strong>. Vous pourrez
            annuler cette action.
          </p>
        </ConfirmDialog>
      ) : null}

      {confirm?.action === 'credit_note' ? (
        <ConfirmDialog
          title="Créer un avoir ?"
          confirmLabel="Créer l’avoir"
          busy={busy === 'credit_note'}
          onConfirm={() => void doCreditNote()}
          onCancel={() => setConfirm(null)}
        >
          <p>
            Un avoir brouillon reprenant les lignes de la facture {doc?.number} sera créé. Ajustez-le si besoin (avoir partiel),
            puis émettez-le : la facture sera alors annulée.
          </p>
        </ConfirmDialog>
      ) : null}

      {confirm?.action === 'delete' ? (
        <ConfirmDialog
          title="Supprimer ce document ?"
          confirmLabel="Supprimer"
          tone="danger"
          busy={busy === 'delete'}
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirm(null)}
        >
          <p>Cette action est définitive.</p>
        </ConfirmDialog>
      ) : null}

      {confirm?.action === 'leave' ? (
        <ConfirmDialog
          title="Quitter sans enregistrer ?"
          confirmLabel="Quitter"
          tone="danger"
          onConfirm={() => {
            const to = confirm.to ?? '/dashboard/documents'
            setConfirm(null)
            navigate(to)
          }}
          onCancel={() => setConfirm(null)}
        >
          <p>Vos modifications non enregistrées seront perdues.</p>
        </ConfirmDialog>
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-[calc(5.25rem+var(--safe-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm text-[var(--white)] shadow-lg md:bottom-8"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </DashboardLayout>
  )
}
