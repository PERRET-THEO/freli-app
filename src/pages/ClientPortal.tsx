import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ScheduleBookingStep } from '../components/onboarding/ScheduleBookingStep'
import { PortalCompletedState } from '../components/portal/PortalCompletedState'
import { PortalFooter } from '../components/portal/PortalFooter'
import { PortalWelcomeHero } from '../components/portal/PortalWelcomeHero'
import { Button } from '../components/ui'
import type { IntegrationResults } from '../lib/integrations/triggerIntegrations'
import {
  getGeneratedDocumentIdFromSignatureValue,
  getTemplateIdFromSignatureValue,
  isContractPendingGeneration,
} from '../lib/contractSignatureValue'
import {
  getPortalGeneratedDocumentPdfUrl,
  getPortalTemplatePdfUrl,
  resolvePortalSigningTemplate,
} from '../lib/contractStorage'
import { isExtractableDocumentItem } from '../lib/documentDisplay'
import {
  portalLoadByToken,
  portalSetProjectStatus,
  portalStampPaymentUnlocked,
  portalTouchVisit,
  portalUpdateChecklistItem,
  PortalUploadError,
  processPortalProjectCompletion,
  requestPortalDocumentUpload,
  uploadPortalDocumentFile,
} from '../lib/portalApi'
import {
  formatPaymentStepCopy,
  formatEuro,
  getPaymentUnlockInfo,
  resolvePaymentState,
} from '../lib/payments'
import { normalizeBrandColor, DEFAULT_BRAND_COLOR } from '../lib/agencyBranding'
import { agencyInitials, portalThemeStyle } from '../lib/portalTheme'
import {
  DEFAULT_PORTAL_HELP_TITLE,
  renderPortalWelcome,
} from '../lib/portalWelcomeTemplate'
import { getVisibleItems } from '../lib/checklistConditions'
import { isOnboardingSettled, isRejected, type ReviewStatus } from '../lib/checklistReview'
import type { ChecklistItemType } from '../lib/checklist'
import {
  FIELD_INPUT_MODES,
  FIELD_PLACEHOLDERS,
  isInputType,
  isSingleLineType,
  normalizeClientAnswer,
  validateClientAnswer,
  validateCredentialsForm,
  type ChecklistItemConfig,
  type CredentialsFormValues,
} from '../lib/checklistFields'
import {
  CredentialsApiError,
  portalSubmitCredentials,
} from '../lib/checklistCredentials'
import { requestPortalPaymentLink } from '../lib/portalPayment'
import {
  clearDraft,
  countRestorableDrafts,
  mergeDraftsIntoValues,
  readDrafts,
  saveDraft,
} from '../lib/portalDrafts'
import { supabase } from '../lib/supabase'

const SignatureModal = lazy(() =>
  import('../components/onboarding/SignatureModal').then((m) => ({ default: m.SignatureModal })),
)

type AgencyPortalRelation = {
  logo_url: string | null
  name?: string
  brand_color?: string | null
  portal_welcome_message?: string | null
  tagline?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  portal_help_title?: string | null
  portal_help_text?: string | null
  portal_availability?: string | null
  portfolio_url?: string | null
  portfolio_label?: string | null
}

type ProjectRecord = {
  id: string
  client_name: string
  client_email?: string | null
  status: 'pending' | 'in_progress' | 'completed'
  token: string
  agency_id?: string | null
  price?: number | null
  payment_status?: string | null
  stripe_checkout_url?: string | null
  payment_unlock_mode?: string | null
  payment_unlocked_at?: string | null
  last_payment_email_sent_at?: string | null
  agencies?: AgencyPortalRelation | AgencyPortalRelation[] | null
}

type ChecklistItemRecord = {
  id: string
  label: string
  type: ChecklistItemType
  completed: boolean
  required?: boolean | null
  value: string | null
  order_index: number
  review_status: ReviewStatus | null
  review_note: string | null
  config: ChecklistItemConfig | null
}

type LoadedContractForSigning = {
  id: string
  name: string
  pdf_url: string | null
  signature_page: number
  signature_x: number
  signature_y: number
  signature_width: number
  signature_height: number
}

function SkeletonLoader() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 rounded-lg bg-[var(--surface-warm)]" />
      <div className="h-4 w-72 rounded bg-[var(--surface-warm)]" />
      <div className="h-3 w-full rounded-full bg-[var(--surface-warm)]" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-4">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-warm)]" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 rounded bg-[var(--surface-warm)]" />
            <div className="h-16 w-full rounded-lg bg-[var(--surface-warm)]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Confetti() {
  const particles = Array.from({ length: 40 }, (_, i) => i)
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map((i) => {
        const left = Math.random() * 100
        const delay = Math.random() * 2
        const dur = 2.5 + Math.random() * 2
        const size = 6 + Math.random() * 6
        const colors = ['#5B6EF5', '#2dd4a0', '#f5a623', '#8b9bff', '#EF4444', '#F59E0B']
        const color = colors[i % colors.length]
        return (
          <div
            key={i}
            className="absolute -top-3 rounded-sm"
            style={{
              left: `${left}%`,
              width: size,
              height: size,
              backgroundColor: color,
              animation: `confetti-fall ${dur}s ${delay}s ease-out forwards`,
              opacity: 0,
            }}
          />
        )
      })}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

type StepStatus = 'completed' | 'active' | 'locked' | 'rejected'

function StepCircle({ index, status }: { index: number; status: StepStatus }) {
  const base = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-display font-bold transition-all duration-300'
  if (status === 'completed')
    return <div className={`${base} bg-[var(--mint)] text-white`}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  if (status === 'rejected')
    return <div className={`${base} bg-[var(--amber)] text-white shadow-[0_0_0_4px_var(--amber-soft)]`}>!</div>
  if (status === 'active')
    return <div className={`${base} bg-[var(--accent)] text-white shadow-[0_0_0_4px_var(--accent-soft)]`}>{index + 1}</div>
  if (status === 'locked')
    return (
      <div className={`${base} bg-[var(--surface-warm)] text-[var(--ink-muted)]`} aria-label="Verrouillé">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </div>
    )
  return <div className={`${base} bg-[var(--surface-warm)] text-[var(--ink-muted)]`}>{index + 1}</div>
}

export function ClientPortal() {
  const { token } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [paymentNotice, setPaymentNotice] = useState<'success' | 'cancelled' | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [items, setItems] = useState<ChecklistItemRecord[]>([])
  const [textValues, setTextValues] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [restoredDraftCount, setRestoredDraftCount] = useState(0)
  const [stepCheckoutUrl, setStepCheckoutUrl] = useState<string | null>(null)
  const [preparingPayment, setPreparingPayment] = useState(false)
  const [paymentStepError, setPaymentStepError] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [completionEmailSent, setCompletionEmailSent] = useState(false)
  const [openStepId, setOpenStepId] = useState<string | null>(null)
  const [showHero, setShowHero] = useState(true)
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [signingItemId, setSigningItemId] = useState<string | null>(null)
  const [loadedTemplate, setLoadedTemplate] = useState<LoadedContractForSigning | null>(null)
  const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null)
  const [integrationResults, setIntegrationResults] = useState<IntegrationResults>({})
  const [integrationsSent, setIntegrationsSent] = useState(false)
  const [checkoutTriggerError, setCheckoutTriggerError] = useState(false)
  const checkoutTriggerAttempts = useRef(0)
  const confettiShown = useRef(false)
  const paymentConfirmPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [credentialForms, setCredentialForms] = useState<Record<string, CredentialsFormValues>>({})
  const [credentialShowPassword, setCredentialShowPassword] = useState<Record<string, boolean>>({})
  const [replacingCredentialsId, setReplacingCredentialsId] = useState<string | null>(null)

  const agencyRelation = useMemo(() => {
    const relation = project?.agencies
    if (!relation) return null
    return Array.isArray(relation) ? relation[0] : relation
  }, [project?.agencies])

  const agencyLogoUrl = agencyRelation?.logo_url ?? null

  const agencyName = agencyRelation?.name ?? 'votre agence'

  const brandColor = normalizeBrandColor(agencyRelation?.brand_color ?? DEFAULT_BRAND_COLOR)

  const clientFirstName = (project?.client_name ?? '').trim().split(/\s+/)[0] || ''
  const portalWelcomeMessage = renderPortalWelcome(agencyRelation?.portal_welcome_message, {
    'client.prenom': clientFirstName,
    'client.entreprise': '',
    'projet.nom': project?.client_name?.trim() || 'votre projet',
    'agence.nom': agencyRelation?.name ?? 'votre agence',
  })

  const agencyTagline = agencyRelation?.tagline?.trim() ?? ''

  const agencyContactEmail = agencyRelation?.contact_email?.trim() ?? ''
  const agencyContactPhone = agencyRelation?.contact_phone?.trim() ?? ''
  const portalHelpTitle =
    agencyRelation?.portal_help_title?.trim() || DEFAULT_PORTAL_HELP_TITLE
  const portalHelpText = agencyRelation?.portal_help_text?.trim() ?? ''
  const portalAvailability = agencyRelation?.portal_availability?.trim() ?? ''
  const portfolioUrl = agencyRelation?.portfolio_url ?? null
  const portfolioLabel = agencyRelation?.portfolio_label ?? null
  const showHelpBlock =
    Boolean(agencyContactEmail) ||
    Boolean(agencyContactPhone) ||
    Boolean(portalHelpText) ||
    Boolean(portalAvailability)

  const portalStyle = useMemo(
    () => portalThemeStyle(brandColor) as CSSProperties,
    [brandColor],
  )

  /**
   * Étapes réellement présentées : `items` reste complet car les conditions
   * référencent la position de l'étape source dans la liste d'origine.
   */
  const visibleItems = useMemo(() => getVisibleItems(items), [items])

  const firstIncompleteId = useMemo(
    () => visibleItems.find((i) => !i.completed)?.id ?? null,
    [visibleItems],
  )

  const signingItem = useMemo(
    () => (signingItemId ? items.find((i) => i.id === signingItemId) ?? null : null),
    [items, signingItemId],
  )

  useEffect(() => {
    if (!signingItemId || !project || !token) {
      setLoadedTemplate(null)
      setTemplatePdfUrl(null)
      return
    }
    const item = items.find((i) => i.id === signingItemId)
    if (!item) return

    let cancelled = false

    const load = async () => {
      const generatedDocumentId = getGeneratedDocumentIdFromSignatureValue(item.value)
      if (generatedDocumentId) {
        try {
          const contract = await getPortalGeneratedDocumentPdfUrl(token, generatedDocumentId)
          if (cancelled) return
          setLoadedTemplate({
            id: generatedDocumentId,
            name: contract.name,
            pdf_url: contract.signedUrl,
            signature_page: contract.signature_page,
            signature_x: contract.signature_x,
            signature_y: contract.signature_y,
            signature_width: contract.signature_width,
            signature_height: contract.signature_height,
          })
          setTemplatePdfUrl(contract.signedUrl)
        } catch {
          if (!cancelled) {
            setLoadedTemplate(null)
            setTemplatePdfUrl(null)
          }
        }
        return
      }

      const templateId = getTemplateIdFromSignatureValue(item.value)
      try {
        const tpl = await resolvePortalSigningTemplate(token, templateId)
        if (cancelled) return
        setLoadedTemplate(tpl)
        setTemplatePdfUrl(tpl.pdf_url)
      } catch {
        if (!cancelled) {
          setLoadedTemplate(null)
          setTemplatePdfUrl(null)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [signingItemId, items, project, token])

  useEffect(() => {
    if (!loadedTemplate?.id || !token) {
      if (!getGeneratedDocumentIdFromSignatureValue(signingItem?.value ?? null)) {
        setTemplatePdfUrl(null)
      }
      return
    }

    const generatedDocumentId = getGeneratedDocumentIdFromSignatureValue(signingItem?.value ?? null)
    if (generatedDocumentId) {
      return
    }

    let cancelled = false
    void getPortalTemplatePdfUrl(token, loadedTemplate.id)
      .then((url) => {
        if (!cancelled) setTemplatePdfUrl(url)
      })
      .catch(() => {
        if (!cancelled) setTemplatePdfUrl(loadedTemplate.pdf_url)
      })
    return () => {
      cancelled = true
    }
  }, [loadedTemplate, token, signingItem?.value])

  useEffect(() => {
    if (!openStepId && firstIncompleteId) {
      setOpenStepId(firstIncompleteId)
    }
  }, [firstIncompleteId, openStepId])

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setError('Lien invalide.')
        setLoading(false)
        return
      }

      try {
        const loaded = await portalLoadByToken(token)
        const agencyBranding = (loaded.branding ?? null) as AgencyPortalRelation | null
        const loadedProject: ProjectRecord = {
          ...loaded.project,
          status: loaded.project.status,
          token,
          agencies: agencyBranding,
        }
        setProject(loadedProject)

        const initialTextValues: Record<string, string> = {}
        const openInputIds = new Set<string>()
        for (const item of loaded.items) {
          if (!isInputType(item.type as ChecklistItemType)) continue
          initialTextValues[item.id] = item.value ?? ''
          if (!item.completed) openInputIds.add(item.id)
        }

        const drafts = readDrafts(token)
        const restorable = countRestorableDrafts(initialTextValues, drafts, openInputIds)
        const parsedItems = loaded.items as ChecklistItemRecord[]
        setItems(parsedItems)
        setTextValues(mergeDraftsIntoValues(initialTextValues, drafts, openInputIds))
        setRestoredDraftCount(restorable)

        if (parsedItems.every((i) => i.completed)) setShowHero(false)
        setLoading(false)

        void portalTouchVisit(token).catch(() => {})
      } catch {
        setError('Projet introuvable pour ce lien.')
        setLoading(false)
      }
    }

    fetchData()
  }, [token])

  useEffect(() => {
    const payment = searchParams.get('payment')
    if (payment !== 'success' && payment !== 'cancelled') return
    setPaymentNotice(payment)
    const next = new URLSearchParams(searchParams)
    next.delete('payment')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // Plus de Realtime anon : refetch au focus après durcissement RLS.
  useEffect(() => {
    if (!token || !project?.id) return
    const refetch = () => {
      void portalLoadByToken(token)
        .then((loaded) => {
          setItems(loaded.items as ChecklistItemRecord[])
          setProject((cur) =>
            cur
              ? {
                  ...cur,
                  ...loaded.project,
                  token,
                  agencies: (loaded.branding as AgencyPortalRelation | null) ?? cur.agencies,
                }
              : cur,
          )
        })
        .catch(() => {})
    }
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [token, project?.id])

  const completedCount = visibleItems.filter((i) => i.completed).length
  const totalCount = visibleItems.length
  const progressPercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  const paymentUnlockInfo = useMemo(
    () =>
      getPaymentUnlockInfo({
        unlockMode: project?.payment_unlock_mode,
        paymentUnlockedAt: project?.payment_unlocked_at,
        items,
      }),
    [project?.payment_unlock_mode, project?.payment_unlocked_at, items],
  )

  const paymentLifecycle = useMemo(
    () =>
      resolvePaymentState({
        price: project?.price,
        paymentStatus: project?.payment_status,
        unlockMode: project?.payment_unlock_mode,
        paymentUnlockedAt: project?.payment_unlocked_at,
        lastPaymentEmailSentAt: project?.last_payment_email_sent_at,
        stripeCheckoutUrl: project?.stripe_checkout_url,
        unlockInfo: paymentUnlockInfo,
      }),
    [project, paymentUnlockInfo],
  )

  const awaitingPaymentConfirmation =
    paymentNotice === 'success' &&
    paymentLifecycle !== 'paid' &&
    Boolean(project?.price && project.price > 0)
  const checkoutUrl =
    integrationResults.stripe?.checkoutUrl ?? project?.stripe_checkout_url ?? null

  // Stamp sticky unlock as soon as prerequisites (completed) are met.
  useEffect(() => {
    if (!token || !project?.price || project.price <= 0) return
    if (project.payment_unlocked_at) return
    if (!paymentUnlockInfo.prerequisitesMet && project.payment_unlock_mode !== 'immediate') {
      return
    }
    void portalStampPaymentUnlocked(token)
      .then((result) => {
        if (result.payment_unlocked_at) {
          setProject((cur) =>
            cur ? { ...cur, payment_unlocked_at: result.payment_unlocked_at } : cur,
          )
        }
      })
      .catch(() => {})
  }, [
    token,
    project?.price,
    project?.payment_unlocked_at,
    project?.payment_unlock_mode,
    paymentUnlockInfo.prerequisitesMet,
  ])

  // After Stripe redirect: poll until webhook confirms payment_status=paid
  useEffect(() => {
    if (!awaitingPaymentConfirmation || !project?.id) return

    const refreshPayment = async () => {
      if (!token) return
      try {
        const loaded = await portalLoadByToken(token)
        setProject((cur) =>
          cur
            ? {
                ...cur,
                payment_status: loaded.project.payment_status,
                stripe_checkout_url: loaded.project.stripe_checkout_url,
              }
            : cur,
        )
      } catch {
        /* ignore poll errors */
      }
    }

    void refreshPayment()
    paymentConfirmPollRef.current = setInterval(() => {
      void refreshPayment()
    }, 2500)

    return () => {
      if (paymentConfirmPollRef.current) {
        clearInterval(paymentConfirmPollRef.current)
        paymentConfirmPollRef.current = null
      }
    }
  }, [awaitingPaymentConfirmation, project?.id, token])

  useEffect(() => {
    if (paymentLifecycle === 'paid' && paymentConfirmPollRef.current) {
      clearInterval(paymentConfirmPollRef.current)
      paymentConfirmPollRef.current = null
    }
  }, [paymentLifecycle])

  useEffect(() => {
    const allDone = isOnboardingSettled(visibleItems)
    setIsCompleted(allDone)
    if (allDone && project?.id) {
      if (!confettiShown.current) {
        confettiShown.current = true
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 5000)
      }
      // completed est posé par portal_update_checklist_item (RPC) — pas par le client.
      // Side effects (email, Drive, webhooks) via process-project-completion uniquement.
      if (
        project.status === 'completed' &&
        token &&
        !completionEmailSent &&
        !integrationsSent
      ) {
        setIntegrationsSent(true)
        setCompletionEmailSent(true)
        void processPortalProjectCompletion({
          projectId: project.id,
          projectToken: token,
        })
          .then(({ results }) => {
            const stripe = results?.stripe as { checkoutUrl?: string } | undefined
            if (stripe?.checkoutUrl) {
              setIntegrationResults((cur) => ({ ...cur, stripe: { checkoutUrl: stripe.checkoutUrl! } }))
              setProject((cur) =>
                cur ? { ...cur, stripe_checkout_url: stripe.checkoutUrl } : cur,
              )
            } else if (
              project.payment_status !== 'paid' &&
              project.price &&
              project.price > 0 &&
              checkoutTriggerAttempts.current < 3
            ) {
              setCheckoutTriggerError(true)
              checkoutTriggerAttempts.current += 1
              window.setTimeout(() => {
                setIntegrationsSent(false)
                setCompletionEmailSent(false)
              }, 8000)
            }
          })
          .catch(() => {
            setCheckoutTriggerError(true)
            setIntegrationsSent(false)
            setCompletionEmailSent(false)
          })
      }
    } else if (project?.id && completedCount > 0 && token && project.status !== 'completed') {
      void portalSetProjectStatus(token, 'in_progress').catch(() => {})
    }
  }, [
    visibleItems,
    completedCount,
    project?.id,
    project?.status,
    project?.payment_status,
    project?.stripe_checkout_url,
    project?.price,
    project?.token,
    token,
    completionEmailSent,
    integrationsSent,
  ])

  const advanceToNext = useCallback((currentId: string) => {
    setJustSavedId(currentId)
    setTimeout(() => setJustSavedId(null), 1200)
    const idx = visibleItems.findIndex((i) => i.id === currentId)
    const nextIncomplete = visibleItems.find((i, j) => j > idx && !i.completed)
    if (nextIncomplete) {
      setTimeout(() => {
        setOpenStepId(nextIncomplete.id)
        setTimeout(() => {
          stepRefs.current[nextIncomplete.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }, 400)
    }
  }, [visibleItems])

  const markItemCompleted = useCallback(async (itemId: string, value: string) => {
    if (!token) return
    setSavingItemId(itemId)
    try {
      const result = await portalUpdateChecklistItem(token, itemId, {
        completed: true,
        value,
        submitted_at: new Date().toISOString(),
      })
      const updated = result.item
      setItems((cur) =>
        cur.map((i) =>
          i.id === itemId
            ? {
                ...i,
                completed: updated.completed,
                value: updated.value,
                review_status: updated.review_status,
                review_note: updated.review_note,
              }
            : i,
        ),
      )
      setProject((cur) => (cur ? { ...cur, status: result.projectStatus } : cur))
      clearDraft(token, itemId)
      advanceToNext(itemId)
    } catch {
      setError('Impossible de sauvegarder. Réessayez.')
    }
    setSavingItemId(null)
  }, [advanceToNext, token])

  // Une étape « Paiement » se valide par le règlement, jamais par une action manuelle.
  useEffect(() => {
    if (paymentLifecycle !== 'paid') return
    const unpaidStep = visibleItems.find((i) => i.type === 'payment' && !i.completed)
    if (!unpaidStep) return
    void markItemCompleted(unpaidStep.id, 'Paiement confirmé')
  }, [paymentLifecycle, visibleItems, markItemCompleted])

  const handleFieldChange = (itemId: string, value: string) => {
    setTextValues((cur) => ({ ...cur, [itemId]: value }))
    setFieldErrors((cur) => {
      if (!cur[itemId]) return cur
      const next = { ...cur }
      delete next[itemId]
      return next
    })
    if (token) saveDraft(token, itemId, value)
  }

  const submitFieldAnswer = async (item: ChecklistItemRecord) => {
    const raw = textValues[item.id] ?? ''
    const validationError = validateClientAnswer(item.type, raw, item.config)
    if (validationError) {
      setFieldErrors((cur) => ({ ...cur, [item.id]: validationError }))
      return
    }
    await markItemCompleted(item.id, normalizeClientAnswer(item.type, raw))
  }

  const emptyCredentialsForm = (): CredentialsFormValues => ({
    username: '',
    password: '',
    loginUrl: '',
  })

  const updateCredentialForm = (
    itemId: string,
    patch: Partial<CredentialsFormValues>,
  ) => {
    setCredentialForms((cur) => ({
      ...cur,
      [itemId]: { ...(cur[itemId] ?? emptyCredentialsForm()), ...patch },
    }))
    setFieldErrors((cur) => {
      if (!cur[itemId]) return cur
      const next = { ...cur }
      delete next[itemId]
      return next
    })
  }

  const submitCredentialsAnswer = async (item: ChecklistItemRecord) => {
    if (!token) return
    const form = credentialForms[item.id] ?? emptyCredentialsForm()
    const validationError = validateCredentialsForm(form)
    if (validationError) {
      setFieldErrors((cur) => ({ ...cur, [item.id]: validationError }))
      return
    }
    setSavingItemId(item.id)
    try {
      const result = await portalSubmitCredentials({
        projectToken: token,
        itemId: item.id,
        username: form.username.trim(),
        password: form.password,
        loginUrl: form.loginUrl.trim() || undefined,
      })
      setItems((cur) =>
        cur.map((row) =>
          row.id === item.id
            ? {
                ...row,
                completed: result.item.completed,
                value: result.item.value,
                review_status: result.item.review_status as ReviewStatus | null,
                review_note: result.item.review_note,
                config: result.item.config,
              }
            : row,
        ),
      )
      setProject((cur) =>
        cur
          ? {
              ...cur,
              status: result.projectStatus as ProjectRecord['status'],
            }
          : cur,
      )
      setCredentialForms((cur) => {
        const next = { ...cur }
        delete next[item.id]
        return next
      })
      setCredentialShowPassword((cur) => {
        const next = { ...cur }
        delete next[item.id]
        return next
      })
      setReplacingCredentialsId(null)
      clearDraft(token, item.id)
      if (result.projectJustCompleted) {
        setIsCompleted(true)
        void processPortalProjectCompletion({
          projectId: project?.id ?? '',
          projectToken: token,
        }).catch(() => {})
      }
      advanceToNext(item.id)
    } catch (reason) {
      const message =
        reason instanceof CredentialsApiError
          ? reason.message
          : 'Impossible d’enregistrer les identifiants.'
      setFieldErrors((cur) => ({ ...cur, [item.id]: message }))
    }
    setSavingItemId(null)
  }

  const preparePaymentStep = async () => {
    if (!token) return
    if (!paymentUnlockInfo.unlocked) {
      setPaymentStepError(paymentUnlockInfo.lockMessage ?? 'Paiement pas encore disponible.')
      return
    }
    setPreparingPayment(true)
    setPaymentStepError(null)
    try {
      const { checkoutUrl, alreadyPaid } = await requestPortalPaymentLink(token)
      if (alreadyPaid) {
        setProject((cur) => (cur ? { ...cur, payment_status: 'paid' } : cur))
        return
      }
      if (!checkoutUrl) {
        setPaymentStepError(`${agencyName} finalise le lien de paiement — réessayez dans un instant.`)
        return
      }
      setStepCheckoutUrl(checkoutUrl)
      window.location.href = checkoutUrl
    } catch (reason) {
      setPaymentStepError(
        reason instanceof Error ? reason.message : 'Paiement indisponible pour le moment.',
      )
    } finally {
      setPreparingPayment(false)
    }
  }

  const handleFileUpload = async (itemId: string, file: File | null) => {
    if (!file || !token) return
    setSavingItemId(itemId)
    try {
      const upload = await requestPortalDocumentUpload({
        projectToken: token,
        itemId,
        file,
      })
      await uploadPortalDocumentFile(file, upload.token, upload.path)
      await markItemCompleted(itemId, upload.path)

      const item = items.find((i) => i.id === itemId)
      if (item && isExtractableDocumentItem(item)) {
        void supabase.functions
          .invoke('extract-document-data', {
            body: { projectToken: token, checklistItemId: itemId },
          })
          .catch(() => {})
      }
    } catch (reason) {
      if (reason instanceof PortalUploadError) {
        setError(reason.message)
      } else {
        setError('Erreur serveur lors de l’envoi du fichier. Réessayez.')
      }
      setSavingItemId(null)
    }
  }

  const scrollToFirstIncomplete = () => {
    setShowHero(false)
    if (firstIncompleteId) {
      setOpenStepId(firstIncompleteId)
      setTimeout(() => {
        stepRefs.current[firstIncompleteId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }

  const stepStatus = (item: ChecklistItemRecord): StepStatus => {
    if (item.completed) return 'completed'
    if (isRejected(item)) return 'rejected'
    if (item.type === 'payment' && !paymentUnlockInfo.unlocked) return 'locked'
    if (item.id === firstIncompleteId) return 'active'
    return 'locked'
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-[var(--surface)]">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <SkeletonLoader />
        </div>
      </div>
    )
  }

  if (error && !project) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--surface)] px-4">
        <div className="rounded-[var(--radius-lg)] bg-[var(--white)] p-8 text-center shadow-lg">
          <p className="text-5xl">🔗</p>
          <p className="mt-4 font-display text-lg font-bold text-[var(--ink)]">Lien introuvable</p>
          <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">{error}</p>
        </div>
      </div>
    )
  }

  if (!project) return null

  return (
    <div className="min-h-dvh bg-[var(--surface)]" style={portalStyle}>
      {showConfetti && <Confetti />}

      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--white)]/95 pt-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {agencyLogoUrl ? (
              <img src={agencyLogoUrl} alt="" className="h-8 w-auto rounded-[var(--radius-xs)] object-contain" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg font-display text-xs font-extrabold"
                style={{
                  backgroundColor: 'var(--portal-accent)',
                  color: 'var(--portal-accent-fg)',
                }}
              >
                {agencyInitials(agencyName)}
              </div>
            )}
            <span className="hidden font-display text-sm font-bold text-[var(--ink)] sm:block">
              {project.client_name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-body text-xs font-medium text-[var(--ink-muted)]">{progressPercent}%</span>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--surface-warm)] sm:w-32">
              <div className="h-full rounded-full bg-[var(--portal-accent,var(--accent))] transition-all duration-500 ease-out motion-reduce:transition-none" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--amber)] bg-[var(--amber-soft)] p-4">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-body font-medium text-[var(--ink)]">{error}</p>
              <button onClick={() => setError(null)} className="mt-1 text-xs font-body text-[var(--ink-muted)] underline">Fermer</button>
            </div>
          </div>
        )}

        {restoredDraftCount > 0 && !isCompleted && (
          <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-4">
            <span className="text-lg">💾</span>
            <div className="flex-1">
              <p className="font-body text-sm font-medium text-[var(--ink)]">
                Nous avons retrouvé {restoredDraftCount} réponse
                {restoredDraftCount > 1 ? 's' : ''} en cours
              </p>
              <p className="mt-0.5 font-body text-xs text-[var(--ink-muted)]">
                Votre saisie non validée a été restaurée sur cet appareil.
              </p>
            </div>
            <button
              onClick={() => setRestoredDraftCount(0)}
              className="font-body text-xs text-[var(--ink-muted)] underline"
            >
              Fermer
            </button>
          </div>
        )}

        {showHero && !isCompleted && (
          <PortalWelcomeHero
            clientName={project.client_name}
            agencyName={agencyName}
            agencyTagline={agencyTagline}
            portalWelcomeMessage={portalWelcomeMessage}
            portfolioUrl={portfolioUrl}
            portfolioLabel={portfolioLabel}
            onStart={scrollToFirstIncomplete}
          />
        )}

        {isCompleted && (
          <PortalCompletedState
            clientName={project.client_name}
            agencyName={agencyName}
            items={visibleItems}
            paymentLifecycle={paymentLifecycle}
            awaitingPaymentConfirmation={awaitingPaymentConfirmation}
            paymentNotice={paymentNotice}
            checkoutUrl={checkoutUrl}
            checkoutTriggerError={checkoutTriggerError}
            price={project.price}
          />
        )}

        <div className="space-y-0">
          {visibleItems.map((item, index) => {
            const status = stepStatus(item)
            const paymentLocked = item.type === 'payment' && !paymentUnlockInfo.unlocked
            const isOpen = openStepId === item.id && !item.completed
            const isLast = index === visibleItems.length - 1
            const isSaving = savingItemId === item.id
            const wasSaved = justSavedId === item.id

            return (
              <div key={item.id} ref={(el) => { stepRefs.current[item.id] = el }} className="relative">
                {!isLast && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-[17px] top-10 z-0 w-0.5 bg-[var(--border)] transition-colors duration-300"
                    style={{ bottom: 0, backgroundColor: item.completed ? 'var(--mint)' : undefined }}
                  />
                )}

                <button
                  type="button"
                  className="group relative z-10 flex w-full items-start gap-4 py-3 text-left"
                  onClick={() => {
                    if (item.completed) return
                    // Payment locked: allow open only to show the lock message.
                    setOpenStepId(isOpen ? null : item.id)
                  }}
                >
                  <StepCircle index={index} status={status} />
                  <div className="flex flex-1 items-center justify-between pt-1.5">
                    <h2 className={`font-display text-base font-semibold transition-colors ${status === 'completed' ? 'text-[var(--ink-muted)] line-through decoration-[var(--mint)]' : status === 'active' || status === 'rejected' ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>
                      {item.label}
                    </h2>
                    {item.completed ? (
                      <span className="flex items-center gap-1 rounded-full bg-[var(--mint-soft)] px-2.5 py-0.5 font-body text-xs font-medium text-[var(--mint)]">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Complété
                      </span>
                    ) : status === 'rejected' ? (
                      <span className="rounded-full bg-[var(--amber-soft)] px-2.5 py-0.5 font-body text-xs font-medium text-[var(--amber)]">
                        À corriger
                      </span>
                    ) : wasSaved ? (
                      <span className="flex items-center gap-1 rounded-full bg-[var(--mint-soft)] px-2.5 py-0.5 font-body text-xs font-medium text-[var(--mint)] animate-pulse">✓ Enregistré</span>
                    ) : null}
                  </div>
                </button>

                <div className={`relative z-10 overflow-hidden pl-0 transition-all duration-300 ease-in-out sm:pl-[52px] ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="bg-[var(--surface)] pb-6 pr-1 sm:bg-transparent">
                    {isRejected(item) && item.review_note ? (
                      <div className="mb-3 rounded-[var(--radius-sm)] border border-[var(--amber)]/50 bg-[var(--amber-soft)] p-3">
                        <p className="font-body text-sm font-medium text-[var(--ink)]">
                          {agencyName} demande une correction
                        </p>
                        <p className="mt-1 font-body text-sm text-[var(--ink-soft)]">
                          {item.review_note}
                        </p>
                      </div>
                    ) : null}

                    {isInputType(item.type) && !item.completed && (
                      <div className="space-y-3">
                        {item.type === 'choice' ? (
                          <div className="space-y-2">
                            {(item.config?.choiceOptions ?? []).map((option) => (
                              <label
                                key={option}
                                className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-4 py-3 font-body text-sm transition-colors ${
                                  (textValues[item.id] ?? '') === option
                                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]/40 text-[var(--ink)]'
                                    : 'border-[var(--border)] bg-[var(--white)] text-[var(--ink-soft)] hover:border-[var(--accent)]'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`choice-${item.id}`}
                                  value={option}
                                  checked={(textValues[item.id] ?? '') === option}
                                  onChange={() => handleFieldChange(item.id, option)}
                                  className="accent-[var(--accent)]"
                                />
                                {option}
                              </label>
                            ))}
                          </div>
                        ) : isSingleLineType(item.type) ? (
                          <input
                            type="text"
                            inputMode={FIELD_INPUT_MODES[item.type]}
                            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 font-body text-base text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all"
                            placeholder={FIELD_PLACEHOLDERS[item.type]}
                            value={textValues[item.id] ?? ''}
                            onChange={(e) => handleFieldChange(item.id, e.target.value)}
                          />
                        ) : (
                          <textarea
                            className="min-h-28 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 font-body text-base text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all"
                            placeholder={FIELD_PLACEHOLDERS.text}
                            value={textValues[item.id] ?? ''}
                            onChange={(e) => handleFieldChange(item.id, e.target.value)}
                          />
                        )}

                        {fieldErrors[item.id] ? (
                          <p className="font-body text-xs text-[var(--amber)]">{fieldErrors[item.id]}</p>
                        ) : null}

                        <div className="flex items-center justify-between gap-3">
                          {item.type === 'text' ? (
                            <span className="font-body text-xs text-[var(--ink-muted)]">
                              {(textValues[item.id] ?? '').length} caractères
                              {(textValues[item.id] ?? '').trim() ? ' · brouillon enregistré' : ''}
                            </span>
                          ) : (
                            <span />
                          )}
                          <Button
                            onClick={() => submitFieldAnswer(item)}
                            disabled={isSaving || !(textValues[item.id] ?? '').trim()}
                          >
                            {isSaving ? 'Enregistrement...' : 'Valider et continuer →'}
                          </Button>
                        </div>
                      </div>
                    )}
                    {isInputType(item.type) && item.completed && (
                      <p className="rounded-[var(--radius-sm)] bg-[var(--surface)] p-3 font-body text-sm text-[var(--ink-soft)]">{item.value}</p>
                    )}

                    {item.type === 'credentials' &&
                      (!item.completed || replacingCredentialsId === item.id) && (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block font-body text-xs font-medium text-[var(--ink-soft)]">
                            Identifiant
                          </label>
                          <input
                            type="text"
                            autoComplete="username"
                            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 font-body text-base text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                            placeholder="ex. contact@entreprise.fr"
                            value={(credentialForms[item.id] ?? emptyCredentialsForm()).username}
                            onChange={(e) => updateCredentialForm(item.id, { username: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-body text-xs font-medium text-[var(--ink-soft)]">
                            Mot de passe
                          </label>
                          <div className="flex gap-2">
                            <input
                              type={credentialShowPassword[item.id] ? 'text' : 'password'}
                              autoComplete="new-password"
                              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 font-body text-base text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                              placeholder="Mot de passe"
                              value={(credentialForms[item.id] ?? emptyCredentialsForm()).password}
                              onChange={(e) => updateCredentialForm(item.id, { password: e.target.value })}
                            />
                            <button
                              type="button"
                              className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 font-body text-xs text-[var(--ink-muted)]"
                              onClick={() =>
                                setCredentialShowPassword((cur) => ({
                                  ...cur,
                                  [item.id]: !cur[item.id],
                                }))
                              }
                            >
                              {credentialShowPassword[item.id] ? 'Masquer' : 'Afficher'}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block font-body text-xs font-medium text-[var(--ink-soft)]">
                            URL de connexion <span className="font-normal text-[var(--ink-muted)]">(optionnel)</span>
                          </label>
                          <input
                            type="url"
                            autoComplete="url"
                            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 font-body text-base text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                            placeholder="https://…"
                            value={(credentialForms[item.id] ?? emptyCredentialsForm()).loginUrl}
                            onChange={(e) => updateCredentialForm(item.id, { loginUrl: e.target.value })}
                          />
                        </div>
                        {fieldErrors[item.id] ? (
                          <p className="font-body text-xs text-[var(--amber)]">{fieldErrors[item.id]}</p>
                        ) : null}
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {replacingCredentialsId === item.id ? (
                            <button
                              type="button"
                              className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 font-body text-xs text-[var(--ink-muted)]"
                              onClick={() => {
                                setReplacingCredentialsId(null)
                                setCredentialForms((cur) => {
                                  const next = { ...cur }
                                  delete next[item.id]
                                  return next
                                })
                              }}
                            >
                              Annuler
                            </button>
                          ) : null}
                          <Button
                            onClick={() => submitCredentialsAnswer(item)}
                            disabled={
                              isSaving ||
                              !(credentialForms[item.id]?.username ?? '').trim() ||
                              !(credentialForms[item.id]?.password ?? '')
                            }
                          >
                            {isSaving ? 'Enregistrement...' : 'Transmettre les identifiants →'}
                          </Button>
                        </div>
                      </div>
                    )}
                    {item.type === 'credentials' &&
                      item.completed &&
                      replacingCredentialsId !== item.id && (
                      <div className="space-y-2 rounded-[var(--radius-sm)] bg-[var(--surface)] p-3">
                        {item.value === 'cleared' ? (
                          <p className="font-body text-sm text-[var(--ink-soft)]">
                            Secret effacé par l’agence — vous pouvez en renvoyer de nouveaux si besoin.
                          </p>
                        ) : (
                          <p className="font-body text-sm text-[var(--ink-soft)]">
                            Identifiants transmis ✓ — stockés de façon sécurisée.
                          </p>
                        )}
                        <button
                          type="button"
                          className="font-body text-xs text-[var(--accent)] underline"
                          onClick={() => {
                            setReplacingCredentialsId(item.id)
                            setCredentialForms((cur) => ({
                              ...cur,
                              [item.id]: emptyCredentialsForm(),
                            }))
                          }}
                        >
                          Remplacer les identifiants
                        </button>
                      </div>
                    )}

                    {item.type === 'file' && !item.completed && (
                      <div className="space-y-3">
                        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--accent)]/40 bg-[var(--accent-soft)]/30 p-8 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50">
                          <span className="text-3xl">📎</span>
                          <span className="font-body text-sm font-medium text-[var(--ink)]">{isSaving ? 'Upload en cours...' : 'Glissez votre fichier ici'}</span>
                          <span className="font-body text-xs text-[var(--ink-muted)]">ou cliquez pour parcourir — PDF, PNG, JPG, ZIP (max 10 Mo)</span>
                          <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.zip" onChange={(e) => handleFileUpload(item.id, e.target.files?.[0] ?? null)} disabled={isSaving} />
                        </label>
                      </div>
                    )}
                    {item.type === 'file' && item.completed && (
                      <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--surface)] p-3">
                        <span className="text-lg text-[var(--mint)]">✓</span>
                        <span className="font-body text-sm text-[var(--ink-soft)]">Fichier reçu : {item.value?.split('/').pop()}</span>
                      </div>
                    )}

                    {item.type === 'signature' && !item.completed && isContractPendingGeneration(item.value) && (
                      <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-warm)] p-4">
                        <p className="font-body text-sm font-medium text-[var(--ink)]">Contrat en préparation</p>
                        <p className="mt-1 font-body text-sm text-[var(--ink-muted)]">
                          Votre contrat est en cours de finalisation par {agencyName}. Vous recevrez un email dès qu&apos;il sera prêt à signer.
                        </p>
                      </div>
                    )}
                    {item.type === 'signature' && !item.completed && !isContractPendingGeneration(item.value) && (
                      <div className="space-y-3">
                        <p className="font-body text-sm text-[var(--ink-muted)]">Lisez et signez le contrat ci-dessous.</p>
                        <Button onClick={() => setSigningItemId(item.id)} disabled={isSaving} className="w-full sm:w-auto">
                          ✍️ Signer le contrat →
                        </Button>
                      </div>
                    )}
                    {item.type === 'signature' && item.completed && (
                      <div className="flex items-start gap-3 rounded-[var(--radius-sm)] bg-[var(--mint-soft)] p-4">
                        <span className="text-lg text-[var(--mint)]">✓</span>
                        <div>
                          <p className="font-body text-sm font-medium text-[var(--ink)]">Contrat signé</p>
                          {item.value?.startsWith('http') && (
                            <a href={item.value} target="_blank" rel="noreferrer" className="mt-1 inline-block font-body text-sm text-[var(--accent)] underline">
                              Télécharger le contrat signé →
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {item.type === 'schedule' && !item.completed && (
                      <ScheduleBookingStep
                        scheduleUrl={item.config?.scheduleUrl}
                        agencyName={agencyName}
                        isSaving={isSaving}
                        onConfirm={() => {
                          void markItemCompleted(item.id, 'Rendez-vous réservé')
                        }}
                      />
                    )}
                    {item.type === 'schedule' && item.completed && (
                      <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--mint-soft)] p-3">
                        <span className="text-lg text-[var(--mint)]">✓</span>
                        <span className="font-body text-sm text-[var(--ink-soft)]">
                          Rendez-vous réservé
                        </span>
                      </div>
                    )}

                    {item.type === 'payment' && !item.completed && (
                      <div className="space-y-3">
                        {paymentLocked ? (
                          <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-warm)] p-4">
                            <p className="font-body text-sm font-medium text-[var(--ink)]">
                              {paymentUnlockInfo.lockMessage ?? 'Paiement pas encore disponible'}
                            </p>
                            <p className="mt-1 font-body text-xs text-[var(--ink-muted)]">
                              Le paiement se débloque dès que les étapes précédentes obligatoires
                              sont soumises (contrat signé inclus).
                            </p>
                          </div>
                        ) : (
                          <>
                            <p className="font-body text-sm text-[var(--ink-muted)]">
                              {formatPaymentStepCopy({
                                price: project.price,
                                isLastStep: isLast,
                              })}
                            </p>
                            {stepCheckoutUrl ? (
                              <a
                                href={stepCheckoutUrl}
                                className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-6 py-3 font-body text-sm font-medium text-[var(--white)] transition hover:brightness-95"
                              >
                                Payer {formatEuro(project.price)} →
                              </a>
                            ) : (
                              <Button
                                onClick={() => void preparePaymentStep()}
                                disabled={preparingPayment}
                              >
                                {preparingPayment ? 'Préparation…' : 'Procéder au paiement'}
                              </Button>
                            )}
                            {paymentStepError ? (
                              <p className="font-body text-xs text-[var(--amber)]">
                                {paymentStepError}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    )}
                    {item.type === 'payment' && item.completed && (
                      <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--mint-soft)] p-3">
                        <span className="text-lg text-[var(--mint)]">✓</span>
                        <span className="font-body text-sm text-[var(--ink-soft)]">
                          Paiement confirmé — {formatEuro(project.price)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      <PortalFooter
        showHelpBlock={showHelpBlock}
        portalHelpTitle={portalHelpTitle}
        portalHelpText={portalHelpText}
        portalAvailability={portalAvailability}
        agencyContactEmail={agencyContactEmail}
        agencyContactPhone={agencyContactPhone}
        projectName={project.client_name}
      />

      {signingItemId && project && (
        <Suspense fallback={null}>
          <SignatureModal
            contractName={loadedTemplate?.name ?? signingItem?.label ?? 'Contrat'}
            pdfUrl={templatePdfUrl}
            signaturePage={loadedTemplate?.signature_page}
            signatureX={loadedTemplate?.signature_x}
            signatureY={loadedTemplate?.signature_y}
            signatureWidth={loadedTemplate?.signature_width}
            signatureHeight={loadedTemplate?.signature_height}
            clientName={project.client_name}
            clientEmail={(project.client_email ?? '').trim()}
            projectToken={token!}
            checklistItemId={signingItemId}
            onComplete={async (signedPdfUrl) => {
              await markItemCompleted(signingItemId, signedPdfUrl)
              setSigningItemId(null)
            }}
            onClose={() => setSigningItemId(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
