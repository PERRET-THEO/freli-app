import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { SignatureModal } from '../components/onboarding/SignatureModal'
import { Button } from '../components/ui'
import { triggerIntegrations } from '../lib/integrations/triggerIntegrations'
import type { IntegrationResults } from '../lib/integrations/triggerIntegrations'
import { getPortalTemplatePdfUrl } from '../lib/contractStorage'
import { sendProjectCompletedEmail } from '../lib/resend'
import { getPaymentState, formatPriceEur } from '../lib/payments'
import { normalizeBrandColor, DEFAULT_BRAND_COLOR } from '../lib/agencyBranding'
import { supabase } from '../lib/supabase'

type ProjectRecord = {
  id: string
  client_name: string
  client_email?: string
  status: 'pending' | 'in_progress' | 'completed'
  token: string
  agency_id?: string | null
  price?: number | null
  payment_status?: string | null
  stripe_checkout_url?: string | null
  agencies?: {
    logo_url: string | null
    name?: string
    brand_color?: string | null
    portal_welcome_message?: string | null
    tagline?: string | null
    contact_email?: string | null
    contact_phone?: string | null
  } | {
    logo_url: string | null
    name?: string
    brand_color?: string | null
    portal_welcome_message?: string | null
    tagline?: string | null
    contact_email?: string | null
    contact_phone?: string | null
  }[] | null
}

type ChecklistItemRecord = {
  id: string
  label: string
  type: 'text' | 'file' | 'signature'
  completed: boolean
  value: string | null
  order_index: number
}

type LoadedTemplate = {
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

function StepCircle({ index, status }: { index: number; status: 'completed' | 'active' | 'locked' }) {
  const base = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-display font-bold transition-all duration-300'
  if (status === 'completed')
    return <div className={`${base} bg-[var(--mint)] text-white`}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  if (status === 'active')
    return <div className={`${base} bg-[var(--accent)] text-white shadow-[0_0_0_4px_var(--accent-soft)]`}>{index + 1}</div>
  return <div className={`${base} bg-[var(--surface-warm)] text-[var(--ink-muted)]`}>{index + 1}</div>
}

function getTemplateIdFromValue(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { template_id?: string }
    return parsed.template_id ?? null
  } catch {
    return null
  }
}

function isContractPendingGeneration(value: string | null): boolean {
  if (!value) return false
  try {
    const parsed = JSON.parse(value) as { status?: string }
    return parsed.status === 'pending_generation'
  } catch {
    return false
  }
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
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [completionEmailSent, setCompletionEmailSent] = useState(false)
  const [openStepId, setOpenStepId] = useState<string | null>(null)
  const [showHero, setShowHero] = useState(true)
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [signingItemId, setSigningItemId] = useState<string | null>(null)
  const [loadedTemplate, setLoadedTemplate] = useState<LoadedTemplate | null>(null)
  const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null)
  const [integrationResults, setIntegrationResults] = useState<IntegrationResults>({})
  const [integrationsSent, setIntegrationsSent] = useState(false)
  const [checkoutTriggerError, setCheckoutTriggerError] = useState(false)
  const checkoutTriggerAttempts = useRef(0)
  const confettiShown = useRef(false)
  const paymentConfirmPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const agencyRelation = useMemo(() => {
    const relation = project?.agencies
    if (!relation) return null
    return Array.isArray(relation) ? relation[0] : relation
  }, [project?.agencies])

  const agencyLogoUrl = agencyRelation?.logo_url ?? null

  const agencyName = agencyRelation?.name ?? 'votre agence'

  const brandColor = normalizeBrandColor(agencyRelation?.brand_color ?? DEFAULT_BRAND_COLOR)

  const portalWelcomeMessage =
    agencyRelation?.portal_welcome_message?.trim() ||
    'Complétez les étapes ci-dessous pour démarrer votre projet. Cela prend environ 10 minutes.'

  const agencyTagline = agencyRelation?.tagline?.trim() ?? ''

  const agencyContactEmail = agencyRelation?.contact_email?.trim() ?? ''
  const agencyContactPhone = agencyRelation?.contact_phone?.trim() ?? ''

  const portalStyle = useMemo(
    () => ({ ['--accent' as string]: brandColor, ['--portal-accent' as string]: brandColor }),
    [brandColor],
  )

  const firstIncompleteId = useMemo(
    () => items.find((i) => !i.completed)?.id ?? null,
    [items],
  )

  const signingItem = useMemo(
    () => (signingItemId ? items.find((i) => i.id === signingItemId) ?? null : null),
    [items, signingItemId],
  )

  useEffect(() => {
    if (!signingItemId || !project) {
      setLoadedTemplate(null)
      return
    }
    const item = items.find((i) => i.id === signingItemId)
    if (!item) return

    const load = async () => {
      const templateId = getTemplateIdFromValue(item.value)
      console.log('Recherche template — template_id depuis value:', templateId)

      let tpl: LoadedTemplate | null = null

      if (templateId) {
        const { data } = await supabase
          .from('contract_templates')
          .select('id, name, pdf_url, signature_page, signature_x, signature_y, signature_width, signature_height')
          .eq('id', templateId)
          .maybeSingle()
        tpl = data as LoadedTemplate | null
      }

      if (!tpl && project.agency_id) {
        console.log('Fallback: chargement template par défaut pour agency_id:', project.agency_id)
        const { data } = await supabase
          .from('contract_templates')
          .select('id, name, pdf_url, signature_page, signature_x, signature_y, signature_width, signature_height')
          .eq('agency_id', project.agency_id)
          .eq('is_default', true)
          .maybeSingle()
        tpl = data as LoadedTemplate | null
      }

      console.log('Template chargé:', tpl)
      console.log('PDF URL:', tpl?.pdf_url)
      setLoadedTemplate(tpl)
    }

    load()
  }, [signingItemId, items, project])

  useEffect(() => {
    if (!loadedTemplate?.id || !token) {
      setTemplatePdfUrl(null)
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
  }, [loadedTemplate, token])

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

      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('id, client_name, client_email, status, token, agency_id, price, payment_status, stripe_checkout_url, agencies(logo_url, name, brand_color, portal_welcome_message, tagline, contact_email, contact_phone)')
        .eq('token', token)
        .maybeSingle()

      if (projectError || !projectData) {
        setError('Projet introuvable pour ce lien.')
        setLoading(false)
        return
      }

      const { data: checklistData, error: checklistError } = await supabase
        .from('checklist_items')
        .select('id, label, type, completed, value, order_index')
        .eq('project_id', projectData.id)
        .order('order_index', { ascending: true })

      if (checklistError) {
        setError('Impossible de charger la checklist.')
        setLoading(false)
        return
      }

      const initialTextValues: Record<string, string> = {}
      for (const item of checklistData ?? []) {
        if (item.type === 'text') initialTextValues[item.id] = item.value ?? ''
      }

      setProject(projectData)
      const parsedItems = (checklistData ?? []) as ChecklistItemRecord[]
      setItems(parsedItems)
      setTextValues(initialTextValues)

      if (parsedItems.every((i) => i.completed)) setShowHero(false)
      setLoading(false)

      // Signal comportemental pour les relances intelligentes (fire-and-forget)
      void supabase
        .from('projects')
        .update({ last_portal_visit_at: new Date().toISOString() })
        .eq('token', token)
        .then(() => {})
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

  useEffect(() => {
    if (!project?.id) return
    const channel = supabase
      .channel(`project-${project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items', filter: `project_id=eq.${project.id}` }, (payload) => {
        const next = payload.new as ChecklistItemRecord
        if (!next?.id) return
        setItems((cur) => cur.map((i) => (i.id === next.id ? { ...i, ...next } : i)))
        if (next.type === 'text') setTextValues((cur) => ({ ...cur, [next.id]: next.value ?? '' }))
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${project.id}` },
        (payload) => {
          const next = payload.new as Partial<ProjectRecord>
          if (!next) return
          setProject((cur) =>
            cur
              ? {
                  ...cur,
                  payment_status: next.payment_status ?? cur.payment_status,
                  stripe_checkout_url: next.stripe_checkout_url ?? cur.stripe_checkout_url,
                  status: (next.status as ProjectRecord['status']) ?? cur.status,
                }
              : cur,
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel).then()
    }
  }, [project?.id])

  const completedCount = items.filter((i) => i.completed).length
  const totalCount = items.length
  const progressPercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  const paymentState = getPaymentState(project?.price, project?.payment_status)
  const awaitingPaymentConfirmation =
    paymentNotice === 'success' && paymentState !== 'paid' && Boolean(project?.price && project.price > 0)
  const checkoutUrl =
    integrationResults.stripe?.checkoutUrl ?? project?.stripe_checkout_url ?? null

  // After Stripe redirect: poll until webhook confirms payment_status=paid
  useEffect(() => {
    if (!awaitingPaymentConfirmation || !project?.id) return

    const refreshPayment = async () => {
      const { data } = await supabase
        .from('projects')
        .select('payment_status, stripe_checkout_url')
        .eq('id', project.id)
        .maybeSingle()
      if (!data) return
      setProject((cur) =>
        cur
          ? {
              ...cur,
              payment_status: data.payment_status,
              stripe_checkout_url: data.stripe_checkout_url,
            }
          : cur,
      )
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
  }, [awaitingPaymentConfirmation, project?.id])

  useEffect(() => {
    if (paymentState === 'paid' && paymentConfirmPollRef.current) {
      clearInterval(paymentConfirmPollRef.current)
      paymentConfirmPollRef.current = null
    }
  }, [paymentState])

  useEffect(() => {
    const allDone = totalCount > 0 && completedCount === totalCount
    setIsCompleted(allDone)
    if (allDone && project?.id) {
      if (!confettiShown.current) {
        confettiShown.current = true
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 5000)
      }
      supabase.from('projects').update({ status: 'completed' }).eq('id', project.id).then()
      if (!completionEmailSent) {
        sendProjectCompletedEmail({ projectId: project.id, projectToken: project.token }).then(() => setCompletionEmailSent(true))
      }
      const needsCheckout =
        project.payment_status !== 'paid' &&
        !project.stripe_checkout_url &&
        !integrationResults.stripe?.checkoutUrl &&
        Boolean(project.price && project.price > 0)
      if (needsCheckout && !integrationsSent && checkoutTriggerAttempts.current < 3) {
        setIntegrationsSent(true)
        setCheckoutTriggerError(false)
        checkoutTriggerAttempts.current += 1
        void (async () => {
          const pid = project.id
          console.log('TRIGGER START', pid, 'attempt', checkoutTriggerAttempts.current)
          try {
            const result = await triggerIntegrations(pid, project.token)
            console.log('TRIGGER RESULT:', result)
            setIntegrationResults(result)
            if (result.stripe?.checkoutUrl) {
              setProject((cur) =>
                cur ? { ...cur, stripe_checkout_url: result.stripe!.checkoutUrl } : cur,
              )
            } else if (project.price && project.price > 0) {
              setCheckoutTriggerError(true)
              // Retry later (max 3) — Stripe may not be ready yet
              window.setTimeout(() => setIntegrationsSent(false), 8000)
            }
          } catch (e) {
            console.error('TRIGGER FAILED', e)
            setCheckoutTriggerError(true)
            window.setTimeout(() => setIntegrationsSent(false), 8000)
          }
        })()
      }
    } else if (project?.id && completedCount > 0) {
      supabase.from('projects').update({ status: 'in_progress' }).eq('id', project.id).then()
    }
  }, [
    completedCount,
    totalCount,
    project?.id,
    project?.payment_status,
    project?.stripe_checkout_url,
    project?.price,
    project?.token,
    completionEmailSent,
    integrationsSent,
    integrationResults.stripe?.checkoutUrl,
  ])

  const advanceToNext = useCallback((currentId: string) => {
    setJustSavedId(currentId)
    setTimeout(() => setJustSavedId(null), 1200)
    const idx = items.findIndex((i) => i.id === currentId)
    const nextIncomplete = items.find((i, j) => j > idx && !i.completed)
    if (nextIncomplete) {
      setTimeout(() => {
        setOpenStepId(nextIncomplete.id)
        setTimeout(() => {
          stepRefs.current[nextIncomplete.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }, 400)
    }
  }, [items])

  const markItemCompleted = async (itemId: string, value: string) => {
    setSavingItemId(itemId)
    const { error: updateError } = await supabase
      .from('checklist_items')
      .update({ completed: true, value })
      .eq('id', itemId)

    if (!updateError) {
      setItems((cur) => cur.map((i) => (i.id === itemId ? { ...i, completed: true, value } : i)))
      advanceToNext(itemId)
    } else {
      setError('Impossible de sauvegarder. Réessayez.')
    }
    setSavingItemId(null)
  }

  const handleFileUpload = async (itemId: string, file: File | null) => {
    if (!file || !token) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Fichier trop volumineux (max 10 Mo).')
      return
    }
    setSavingItemId(itemId)
    const filePath = `${token}/${itemId}/${file.name}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file, { upsert: true })
    if (uploadError) {
      setError("Échec de l'upload. Réessayez.")
      setSavingItemId(null)
      return
    }
    await markItemCompleted(itemId, filePath)

    // Extraction IA côté agence (fire-and-forget) : n'impacte jamais le parcours client
    supabase.functions
      .invoke('extract-document-data', {
        body: { projectToken: token, checklistItemId: itemId, storagePath: filePath },
      })
      .catch(() => {})
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

  const stepStatus = (item: ChecklistItemRecord): 'completed' | 'active' | 'locked' => {
    if (item.completed) return 'completed'
    if (item.id === firstIncompleteId) return 'active'
    return 'locked'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--surface)]">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <SkeletonLoader />
        </div>
      </div>
    )
  }

  if (error && !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
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
    <div className="min-h-screen bg-[var(--surface)]" style={portalStyle}>
      {showConfetti && <Confetti />}

      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--white)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {agencyLogoUrl ? (
              <img src={agencyLogoUrl} alt="" className="h-8 w-auto rounded-[var(--radius-xs)]" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] font-display text-xs font-extrabold text-white">Fr</div>
            )}
            <span className="hidden font-display text-sm font-bold text-[var(--ink)] sm:block">
              {project.client_name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-body text-xs font-medium text-[var(--ink-muted)]">{progressPercent}%</span>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--surface-warm)] sm:w-32">
              <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
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

        {showHero && !isCompleted && (
          <div className="mb-8 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--white)] p-6 shadow-[0_2px_16px_rgba(13,15,20,0.06)] sm:p-8">
            <p className="text-4xl">👋</p>
            <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
              Bonjour {project.client_name} !
            </h1>
            <p className="mt-2 font-body text-base text-[var(--ink-soft)]">
              Votre espace d&apos;onboarding avec <strong>{agencyName}</strong>
            </p>
            {agencyTagline ? (
              <p className="mt-1 font-body text-sm text-[var(--ink-muted)]">{agencyTagline}</p>
            ) : null}
            <p className="mt-2 font-body text-sm text-[var(--ink-muted)]">{portalWelcomeMessage}</p>
            <Button className="mt-5 w-full sm:w-auto" onClick={scrollToFirstIncomplete}>Commencer →</Button>
          </div>
        )}

        {isCompleted && (
          <div className="mb-8 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--white)] p-6 text-center shadow-[0_2px_16px_rgba(13,15,20,0.06)] sm:p-10">
            <p className="text-5xl animate-bounce">🎉</p>
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-[var(--accent)] sm:text-3xl">Onboarding complété !</h1>
            <p className="mx-auto mt-3 max-w-sm font-body text-base text-[var(--ink-soft)]">
              Merci <strong>{project.client_name}</strong>, {agencyName} a été notifié et vous contactera très bientôt.
            </p>
            <div className="mx-auto mt-6 max-w-xs space-y-2 text-left">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--mint-soft)] px-3 py-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[var(--mint)]"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span className="font-body text-sm text-[var(--ink-soft)]">{item.label}</span>
                </div>
              ))}
            </div>
            {paymentState === 'paid' ? (
              <div className="mx-auto mt-6 max-w-sm rounded-[var(--radius-sm)] bg-[var(--mint-soft)] px-4 py-3">
                <p className="font-body text-sm font-medium text-[var(--ink)]">
                  Paiement confirmé{project.price ? ` — ${formatPriceEur(project.price)}` : ''}. Merci !
                </p>
              </div>
            ) : awaitingPaymentConfirmation ? (
              <div className="mx-auto mt-6 max-w-sm rounded-[var(--radius-sm)] bg-[var(--surface-warm)] px-4 py-3">
                <p className="font-body text-sm font-medium text-[var(--ink)]">
                  Paiement en cours de confirmation…
                </p>
                <p className="mt-1 font-body text-xs text-[var(--ink-muted)]">
                  Merci, nous finalisons la validation. Cette page se mettra à jour automatiquement.
                </p>
              </div>
            ) : paymentState === 'pending' ? (
              <div className="mx-auto mt-6 max-w-sm">
                {paymentNotice === 'cancelled' && (
                  <p className="mb-3 font-body text-sm text-[var(--ink-soft)]">
                    Paiement annulé — vous pouvez réessayer ci-dessous.
                  </p>
                )}
                {checkoutUrl ? (
                  <>
                    <a
                      href={checkoutUrl}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-6 py-3 font-body text-sm font-medium text-[var(--white)] transition hover:brightness-95"
                    >
                      Procéder au paiement{project.price ? ` (${formatPriceEur(project.price)})` : ''}
                    </a>
                    <p className="mt-3 font-body text-xs text-[var(--ink-muted)]">
                      Un email avec le lien de paiement vous a également été envoyé.
                    </p>
                  </>
                ) : (
                  <p className="font-body text-sm text-[var(--ink-soft)]">
                    {checkoutTriggerError
                      ? `${agencyName} finalise le lien de paiement — réessayez dans un instant ou contactez l’agence.`
                      : `${agencyName} vous enverra le lien de paiement très bientôt.`}
                  </p>
                )}
              </div>
            ) : null}
            <p className="mt-6 font-body text-xs text-[var(--ink-muted)]">Vous pouvez fermer cette page.</p>
          </div>
        )}

        <div className="space-y-0">
          {items.map((item, index) => {
            const status = stepStatus(item)
            const isOpen = openStepId === item.id && !item.completed
            const isLast = index === items.length - 1
            const isSaving = savingItemId === item.id
            const wasSaved = justSavedId === item.id

            return (
              <div key={item.id} ref={(el) => { stepRefs.current[item.id] = el }} className="relative">
                {!isLast && (
                  <div className="absolute left-[17px] top-10 w-0.5 bg-[var(--border)] transition-colors duration-300" style={{ bottom: 0, backgroundColor: item.completed ? 'var(--mint)' : undefined }} />
                )}

                <button
                  type="button"
                  className="group relative flex w-full items-start gap-4 py-3 text-left"
                  onClick={() => { if (!item.completed) setOpenStepId(isOpen ? null : item.id) }}
                >
                  <StepCircle index={index} status={status} />
                  <div className="flex flex-1 items-center justify-between pt-1.5">
                    <h2 className={`font-display text-base font-semibold transition-colors ${status === 'completed' ? 'text-[var(--ink-muted)] line-through decoration-[var(--mint)]' : status === 'active' ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>
                      {item.label}
                    </h2>
                    {item.completed ? (
                      <span className="flex items-center gap-1 rounded-full bg-[var(--mint-soft)] px-2.5 py-0.5 font-body text-xs font-medium text-[var(--mint)]">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Complété
                      </span>
                    ) : wasSaved ? (
                      <span className="flex items-center gap-1 rounded-full bg-[var(--mint-soft)] px-2.5 py-0.5 font-body text-xs font-medium text-[var(--mint)] animate-pulse">✓ Enregistré</span>
                    ) : null}
                  </div>
                </button>

                <div className={`overflow-hidden pl-0 transition-all duration-300 ease-in-out sm:pl-[52px] ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="pb-6 pr-1">
                    {item.type === 'text' && !item.completed && (
                      <div className="space-y-3">
                        <textarea
                          className="min-h-28 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 font-body text-sm text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all"
                          placeholder="Décrivez votre projet, vos objectifs..."
                          value={textValues[item.id] ?? ''}
                          onChange={(e) => setTextValues((cur) => ({ ...cur, [item.id]: e.target.value }))}
                        />
                        <div className="flex items-center justify-between">
                          <span className="font-body text-xs text-[var(--ink-muted)]">{(textValues[item.id] ?? '').length} caractères</span>
                          <Button onClick={() => markItemCompleted(item.id, textValues[item.id] ?? '')} disabled={isSaving || !(textValues[item.id] ?? '').trim()}>
                            {isSaving ? 'Enregistrement...' : 'Valider et continuer →'}
                          </Button>
                        </div>
                      </div>
                    )}
                    {item.type === 'text' && item.completed && (
                      <p className="rounded-[var(--radius-sm)] bg-[var(--surface)] p-3 font-body text-sm text-[var(--ink-soft)]">{item.value}</p>
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
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      <footer className="pb-8 text-center">
        {(agencyContactEmail || agencyContactPhone) && (
          <div className="mb-3 font-body text-xs text-[var(--ink-muted)]">
            {agencyContactEmail ? <p>{agencyContactEmail}</p> : null}
            {agencyContactPhone ? <p className="mt-0.5">{agencyContactPhone}</p> : null}
          </div>
        )}
        <p className="font-body text-xs text-[var(--ink-muted)]">
          Propulsé par{' '}<span className="font-display font-bold text-[var(--ink)]">Freli</span>
        </p>
      </footer>

      {signingItemId && project && (
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
          onComplete={async (signedPdfUrl) => {
            await markItemCompleted(signingItemId, signedPdfUrl)
            setSigningItemId(null)
          }}
          onClose={() => setSigningItemId(null)}
        />
      )}
    </div>
  )
}
