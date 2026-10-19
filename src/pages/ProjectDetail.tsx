import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { ExtractionReviewPanel } from '../components/extraction/ExtractionReviewPanel'
import { ChecklistReviewPanel } from '../components/review/ChecklistReviewPanel'
import { SmartRemindersPanel } from '../components/reminders/SmartRemindersPanel'
import { ContractGeneratorPanel } from '../components/contracts/ContractGeneratorPanel'
import { ClientContactBlock } from '../components/client/ClientContactBlock'
import { ClientActivityTimeline } from '../components/client/ClientActivityTimeline'
import { Badge, Button, Card, Input } from '../components/ui'
import {
  mergeClientActivityEvents,
  type ClientActivityEvent,
} from '../lib/clientActivity'
import { ResendInviteModal } from '../components/projects/ResendInviteModal'
import {
  InviteRateLimitError,
  sendProjectInviteEmail,
  sendProjectReminderEmail,
} from '../lib/resend'
import {
  canResendInvite,
  formatRetryAfterMessage,
  inviteBannerLabel,
  shouldHighlightResendInvite,
  shouldShowResendInvite,
} from '../lib/projectInvite'
import { requestSmartReminder } from '../lib/smartReminders'
import { sendPaymentLink } from '../lib/stripePayment'
import { syncProjectDriveFolder } from '../lib/googleDriveConnect'
import { openStripeExpressDashboard } from '../lib/stripeConnectDashboard'
import {
  canEditProjectPrice,
  formatEuro,
  getPaymentUnlockInfo,
  parsePriceInput,
  PAYMENT_LIFECYCLE_LABELS,
  resolvePaymentState,
  type PaymentLifecycleState,
} from '../lib/payments'
import { updateProjectPrice } from '../lib/projectPrice'
import { formatRelative } from '../lib/formatRelative'
import { fetchAgencyAiFlags } from '../lib/agencyQueries'
import { getVisibleItems } from '../lib/checklistConditions'
import type { ChecklistItemConfig } from '../lib/checklistFields'
import {
  countAwaitingReview,
  isOnboardingSettled,
  isRejected,
  type ReviewStatus,
} from '../lib/checklistReview'
import { getClientPendingActions } from '../lib/clientPendingActions'
import {
  findProjectBottleneck,
  formatBottleneckAge,
  formatBottleneckLabel,
  isBottleneckStale,
} from '../lib/projectBottleneck'
import {
  countConsecutiveAutoReminders,
  isReminderCapReached,
  lastClientActivityAnchor,
} from '../lib/reminderCap'
import { pushRecentProject } from '../lib/recentProjects'
import { fetchProjectSignatureProofs, type SignatureProof } from '../lib/signatureProof'
import { supabase } from '../lib/supabase'

type ClientJoin = {
  phone: string | null
  address_street: string | null
  address_postal_code: string | null
  address_city: string | null
  address_country: string | null
  company_name: string | null
}

type ProjectRecord = {
  id: string
  name: string | null
  client_name: string
  client_email: string
  client_id: string | null
  status: 'pending' | 'in_progress' | 'completed'
  token: string
  created_at: string
  last_reminder_sent_at: string | null
  last_portal_visit_at: string | null
  reminder_cap_reset_at: string | null
  price: number | null
  payment_status: string | null
  stripe_checkout_url: string | null
  last_payment_email_sent_at: string | null
  payment_unlock_mode: string | null
  payment_unlocked_at: string | null
  google_drive_folder_url: string | null
  google_drive_files_synced_at: string | null
  google_drive_sync_status: 'synced' | 'partial' | 'failed' | null
  invite_status: 'pending' | 'sent' | 'failed' | null
  invite_sent_at: string | null
  invite_error: string | null
  invite_last_attempt_at: string | null
  derivedStatus?:
    | 'action_required'
    | 'waiting_client'
    | 'stalled'
    | 'completed'
    | 'draft'
  agency_id: string
  agencies?:
    | { name: string | null; ai_reminder_max_per_project?: number | null }
    | { name: string | null; ai_reminder_max_per_project?: number | null }[]
    | null
  clients?: ClientJoin | ClientJoin[] | null
}

type ChecklistItemRecord = {
  id: string
  label: string
  type: string
  completed: boolean
  required: boolean | null
  value: string | null
  order_index: number
  review_status: ReviewStatus | null
  review_note: string | null
  reviewed_at: string | null
  submitted_at: string | null
  config: ChecklistItemConfig | null
}

type ReminderLog = {
  id: string
  source: 'auto' | 'manual'
  sent_at: string
  status?: 'sending' | 'sent' | 'failed' | null
}

export function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const priceInputRef = useRef<HTMLInputElement>(null)
  const paymentFeedbackTimer = useRef<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [items, setItems] = useState<ChecklistItemRecord[]>([])
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([])
  const [projectActivity, setProjectActivity] = useState<ClientActivityEvent[]>([])
  const [signatureProofs, setSignatureProofs] = useState<Record<string, SignatureProof>>({})
  const [sendingReminder, setSendingReminder] = useState(false)
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null)
  const [sendingPayment, setSendingPayment] = useState(false)
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [priceFieldError, setPriceFieldError] = useState<string | null>(null)
  const [openingStripe, setOpeningStripe] = useState(false)
  const [syncingDrive, setSyncingDrive] = useState(false)
  const [driveFeedback, setDriveFeedback] = useState<string | null>(null)
  const [driveError, setDriveError] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [aiContractsEnabled, setAiContractsEnabled] = useState(false)
  const [aiRemindersEnabled, setAiRemindersEnabled] = useState(false)
  const [reminderMaxPerProject, setReminderMaxPerProject] = useState(3)
  const [resettingCap, setResettingCap] = useState(false)
  const [smartRemindersKey, setSmartRemindersKey] = useState(0)
  const [resendingInvite, setResendingInvite] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null)
  const [showResendInviteModal, setShowResendInviteModal] = useState(false)
  const [inviteToast, setInviteToast] = useState<string | null>(null)
  const [inviteRetryAfterMs, setInviteRetryAfterMs] = useState<number | null>(null)
  const [inviteResendCount24h, setInviteResendCount24h] = useState(0)
  const [hasManualResend, setHasManualResend] = useState(false)
  const [editingPrice, setEditingPrice] = useState(false)
  const [priceDraft, setPriceDraft] = useState('')
  const [resendPaymentEmail, setResendPaymentEmail] = useState(true)
  const [savingPrice, setSavingPrice] = useState(false)

  const showPaymentFeedback = useCallback((message: string) => {
    if (paymentFeedbackTimer.current) {
      window.clearTimeout(paymentFeedbackTimer.current)
    }
    setPaymentFeedback(message)
    paymentFeedbackTimer.current = window.setTimeout(() => {
      setPaymentFeedback(null)
      paymentFeedbackTimer.current = null
    }, 6000)
  }, [])

  const loadProject = useCallback(async () => {
    if (!id) {
      setError('Projet introuvable.')
      setLoading(false)
      return
    }

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, agency_id, client_id, name, client_name, client_email, status, token, created_at, last_reminder_sent_at, last_portal_visit_at, reminder_cap_reset_at, price, payment_status, stripe_checkout_url, last_payment_email_sent_at, payment_unlock_mode, payment_unlocked_at, google_drive_folder_url, google_drive_files_synced_at, google_drive_sync_status, invite_status, invite_sent_at, invite_error, invite_last_attempt_at, agencies(name, ai_reminder_max_per_project), clients(phone, address_street, address_postal_code, address_city, address_country, company_name)')
      .eq('id', id)
      .maybeSingle()

    if (projectError || !projectData) {
      setError('Projet introuvable.')
      setLoading(false)
      return
    }

    const aiFlags = await fetchAgencyAiFlags(projectData.agency_id)
    setAiContractsEnabled(aiFlags.ai_contracts_enabled === true)
    setAiRemindersEnabled(aiFlags.ai_reminders_enabled === true)
    const agencySettingsRel = projectData.agencies as
      | { ai_reminder_max_per_project?: number | null }
      | { ai_reminder_max_per_project?: number | null }[]
      | null
    const agencySettings = Array.isArray(agencySettingsRel)
      ? agencySettingsRel[0]
      : agencySettingsRel
    setReminderMaxPerProject(
      typeof agencySettings?.ai_reminder_max_per_project === 'number'
        ? agencySettings.ai_reminder_max_per_project
        : 3,
    )

    const { data: checklistData, error: checklistError } = await supabase
      .from('checklist_items')
      .select(
        'id, label, type, completed, required, value, order_index, review_status, review_note, reviewed_at, submitted_at, config',
      )
      .eq('project_id', projectData.id)
      .order('order_index', { ascending: true })

    if (checklistError) {
      setError('Impossible de charger la checklist.')
      setLoading(false)
      return
    }

    const [{ data: logsData }, { data: activityRows }, authResult, { data: derivedRows }] =
      await Promise.all([
      supabase
        .from('project_reminder_logs')
        .select('id, source, sent_at, status')
        .eq('project_id', projectData.id)
        .order('sent_at', { ascending: false })
        .limit(20),
      supabase
        .from('client_activity_events')
        .select('id, event_type, title, occurred_at, project_id, metadata')
        .eq('project_id', projectData.id)
        .in('event_type', [
          'secret.reveal',
          'secret.copy',
          'secret.cleared',
          'payment.amount_changed',
          'reminder_cap_reset',
          'invite.resent',
        ])
        .order('occurred_at', { ascending: false })
        .limit(50),
      supabase.auth.getUser(),
      supabase.rpc('project_derived_statuses', { p_project_ids: [projectData.id] }),
    ])

    const derivedStatus = (
      (derivedRows as { derived_status?: string }[] | null)?.[0]?.derived_status ??
      (projectData.status === 'completed' ? 'completed' : 'waiting_client')
    ) as NonNullable<ProjectRecord['derivedStatus']>

    const record = { ...(projectData as ProjectRecord), derivedStatus }
    const agenciesRel = record.agencies
    const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
    // Prefer the signed-in user for amount edits; fall back to agency name.
    const actorLabel =
      authResult.data.user?.email?.trim() ||
      agencyRow?.name?.trim() ||
      null

    setProject(record)
    pushRecentProject(record.id, record.name?.trim() || record.client_name)
    setItems((checklistData ?? []) as ChecklistItemRecord[])
    setReminderLogs((logsData ?? []) as ReminderLog[])
    {
      const dayAgo = Date.now() - 24 * 60 * 60_000
      const resentRows = (activityRows ?? []).filter((row) => row.event_type === 'invite.resent')
      setHasManualResend(resentRows.length > 0)
      setInviteResendCount24h(
        resentRows.filter((row) => new Date(row.occurred_at).getTime() > dayAgo).length,
      )
    }
    setProjectActivity(
      mergeClientActivityEvents({
        projects: [
          {
            id: record.id,
            client_name: record.name?.trim() || record.client_name,
            created_at: record.created_at,
          },
        ],
        reminders: (logsData ?? []).map((row) => ({
          id: row.id,
          project_id: record.id,
          source: row.source as 'auto' | 'manual',
          sent_at: row.sent_at,
        })),
        checklist: [],
        extractions: [],
        storedEvents: (activityRows ?? []).map((row) => ({
          ...row,
          project_id: row.project_id ?? record.id,
        })),
        defaultActorLabel: actorLabel,
      }).map((event) => ({ ...event, projectName: null })),
    )
    setSignatureProofs(await fetchProjectSignatureProofs(projectData.id))
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  // Une étape masquée par une condition n'est pas attendue du client : elle ne
  // compte ni dans l'avancement, ni dans les relances.
  const visibleItems = useMemo(() => getVisibleItems(items), [items])
  const completedCount = visibleItems.filter((item) => item.completed).length
  const totalCount = visibleItems.length
  const progress = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  const createdAtLabel = useMemo(() => {
    if (!project?.created_at) return ''
    return new Date(project.created_at).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }, [project?.created_at])

  const awaitingReviewCount = countAwaitingReview(visibleItems)
  const allSettled = isOnboardingSettled(visibleItems)
  const reminderDisabled = sendingReminder || allSettled

  const bottleneck = useMemo(() => {
    if (!project || project.status === 'completed') return null
    return findProjectBottleneck(items, project.created_at)
  }, [items, project])

  const clientPendingActions = useMemo(() => getClientPendingActions(items), [items])
  const clientActionLabels = useMemo(
    () => clientPendingActions.map((item) => item.label),
    [clientPendingActions],
  )
  const firstClientAction = clientPendingActions[0] ?? null

  const consecutiveAutoReminders = useMemo(() => {
    if (!project) return 0
    const maxSubmittedAt = items.reduce<string | null>((latest, item) => {
      if (!item.submitted_at) return latest
      if (!latest) return item.submitted_at
      return new Date(item.submitted_at) > new Date(latest) ? item.submitted_at : latest
    }, null)
    const anchor = lastClientActivityAnchor({
      maxSubmittedAt,
      lastPortalVisitAt: project.last_portal_visit_at,
      reminderCapResetAt: project.reminder_cap_reset_at,
    })
    return countConsecutiveAutoReminders(reminderLogs, anchor)
  }, [items, project, reminderLogs])

  const unreachableClient =
    project != null &&
    project.status !== 'completed' &&
    isReminderCapReached(consecutiveAutoReminders, reminderMaxPerProject)

  const handleResetReminderCap = async () => {
    if (!project) return
    setResettingCap(true)
    setReminderFeedback(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('reset_reminder_cap', {
        p_project_id: project.id,
      })
      if (rpcError) throw new Error(rpcError.message)
      const row = (Array.isArray(data) ? data[0] : data) as
        | { ok?: boolean; error_code?: string | null }
        | null
      if (!row || row.ok !== true) {
        throw new Error(row?.error_code ?? 'reset_failed')
      }
      setReminderFeedback('Compteur de relances réarmé — les auto-relances peuvent reprendre.')
      await loadProject()
    } catch (reason: unknown) {
      setReminderFeedback(
        reason instanceof Error ? reason.message : 'Impossible de réarmer le compteur.',
      )
    } finally {
      setResettingCap(false)
    }
  }

  const handleSendReminder = async () => {
    if (!project) return
    if (aiRemindersEnabled && clientActionLabels.length === 0) {
      setError('Rien à demander au client : des éléments attendent votre validation.')
      return
    }
    setSendingReminder(true)
    setReminderFeedback(null)
    setError(null)
    try {
      if (aiRemindersEnabled) {
        setReminderFeedback('Génération du brouillon…')
        const result = await requestSmartReminder(project.id)
        setSmartRemindersKey((key) => key + 1)
        if (result.status === 'sent') {
          setReminderFeedback('Relance intelligente envoyée au client.')
        } else if (result.existing) {
          setReminderFeedback(
            'Un brouillon de relance IA est déjà prêt ci-dessous — validez-le pour l’envoyer.',
          )
        } else if (!result.reminderId) {
          throw new Error("Le brouillon n'a pas pu être généré — réessayez.")
        } else {
          setReminderFeedback(
            'Brouillon de relance IA généré — validez-le dans la section Relances intelligentes.',
          )
        }
      } else {
        await sendProjectReminderEmail({ projectId: project.id })
        setReminderFeedback('Relance envoyée au client.')
      }
      await loadProject()
    } catch (reason: unknown) {
      const exactError =
        reason instanceof Error
          ? reason.message
          : "Le brouillon n'a pas pu être généré — réessayez."
      setError(exactError)
      setReminderFeedback(null)
    } finally {
      setSendingReminder(false)
    }
  }

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
    (): PaymentLifecycleState | null =>
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

  const canRequestPayment =
    Boolean(paymentUnlockInfo.unlocked) &&
    (paymentLifecycle === 'available' ||
      paymentLifecycle === 'link_created' ||
      paymentLifecycle === 'link_sent' ||
      paymentLifecycle === 'failed')

  const priceEditable = canEditProjectPrice(paymentLifecycle)
  const needsCheckoutInvalidate =
    paymentLifecycle === 'link_created' || paymentLifecycle === 'link_sent'

  const startEditPrice = () => {
    if (!project || !priceEditable) return
    setPriceDraft(project.price != null ? String(project.price) : '')
    setResendPaymentEmail(Boolean(project.last_payment_email_sent_at))
    setEditingPrice(true)
    setPaymentError(null)
    setPriceFieldError(null)
    setPaymentFeedback(null)
  }

  const handleSavePrice = async () => {
    if (!project) return
    const next = parsePriceInput(priceDraft)
    if (next == null) {
      const message = 'Montant invalide (doit être > 0, max 2 décimales).'
      setPriceFieldError(message)
      window.setTimeout(() => priceInputRef.current?.focus(), 0)
      return
    }
    if (
      needsCheckoutInvalidate &&
      !window.confirm(
        'Le lien actuel sera désactivé ; un nouveau lien sera créé au nouveau montant.',
      )
    ) {
      return
    }

    setSavingPrice(true)
    setPaymentError(null)
    setPriceFieldError(null)
    setPaymentFeedback(null)
    try {
      const result = await updateProjectPrice(project.id, next)
      // Update local state immediately so the payment block reflects the DB
      // before / even if the subsequent refetch is slow.
      setProject((cur) =>
        cur
          ? {
              ...cur,
              price: result.price,
              stripe_checkout_url: null,
              last_payment_email_sent_at: null,
            }
          : cur,
      )
      setEditingPrice(false)

      if (result.changed && resendPaymentEmail && result.hadPaymentEmail) {
        const sent = await sendPaymentLink(project.id, true)
        showPaymentFeedback(
          sent.emailSent
            ? `Montant mis à jour (${formatEuro(result.oldPrice)} → ${formatEuro(result.price)}). Nouveau lien envoyé au client.`
            : `Montant mis à jour. Lien généré (email non envoyé).`,
        )
      } else if (result.changed) {
        showPaymentFeedback(
          `Montant mis à jour : ${formatEuro(result.oldPrice)} → ${formatEuro(result.price)}.`,
        )
      }
      await loadProject()
    } catch (reason: unknown) {
      const message =
        reason instanceof Error ? reason.message : 'Impossible de modifier le montant.'
      if (message.includes('Montant invalide')) {
        setEditingPrice(true)
        setPriceFieldError(message)
        window.setTimeout(() => priceInputRef.current?.focus(), 0)
      } else {
        setPaymentError(message)
      }
    } finally {
      setSavingPrice(false)
    }
  }

  useEffect(() => {
    return () => {
      if (paymentFeedbackTimer.current) {
        window.clearTimeout(paymentFeedbackTimer.current)
      }
    }
  }, [])

  const handleSendPaymentLink = async () => {
    if (!project) return
    setSendingPayment(true)
    setPaymentFeedback(null)
    setPaymentError(null)
    try {
      const result = await sendPaymentLink(project.id)
      setPaymentFeedback(
        result.emailSent
          ? 'Lien de paiement envoyé au client par email.'
          : 'Lien de paiement généré (email non envoyé).',
      )
      await loadProject()
    } catch (reason: unknown) {
      setPaymentError(
        reason instanceof Error ? reason.message : 'Impossible de générer le lien de paiement.',
      )
    } finally {
      setSendingPayment(false)
    }
  }

  const handleCopyPaymentLink = async () => {
    if (!project?.stripe_checkout_url) return
    await navigator.clipboard.writeText(project.stripe_checkout_url)
    setPaymentFeedback('Lien de paiement copié.')
  }

  const handleOpenStripeDashboard = async () => {
    setOpeningStripe(true)
    setPaymentError(null)
    try {
      await openStripeExpressDashboard()
    } catch (reason: unknown) {
      setPaymentError(
        reason instanceof Error ? reason.message : 'Impossible d\'ouvrir l\'espace Stripe',
      )
    } finally {
      setOpeningStripe(false)
    }
  }

  const handleCreateDriveFolder = async () => {
    if (!project) return
    setSyncingDrive(true)
    setDriveFeedback(null)
    setDriveError(null)
    try {
      const result = await syncProjectDriveFolder(project.id)
      const synced = result.filesUploaded + result.filesSkipped
      setDriveFeedback(
        result.status === 'partial'
          ? `Synchronisation partielle : ${result.filesUploaded} fichier(s) envoyé(s).`
          : `Dossier Google Drive à jour : ${synced} fichier(s) synchronisé(s).`,
      )
      await loadProject()
    } catch (reason: unknown) {
      setDriveError(
        reason instanceof Error ? reason.message : 'Impossible de synchroniser vers Drive',
      )
    } finally {
      setSyncingDrive(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    setDeleteLoading(true)
    await supabase.from('checklist_items').delete().eq('project_id', id)
    await supabase.from('projects').delete().eq('id', id)
    navigate('/dashboard', { replace: true })
  }

  const inviteGate = useMemo(() => {
    if (!project) return { ok: false as const, reason: 'completed' as const }
    return canResendInvite({
      inviteStatus: project.invite_status,
      inviteLastAttemptAt: project.invite_last_attempt_at,
      inviteSentAt: project.invite_sent_at,
      projectStatus: project.status,
      resendCount24h: inviteResendCount24h,
      retryAfterMs: inviteRetryAfterMs,
    })
  }, [project, inviteResendCount24h, inviteRetryAfterMs])

  const handleConfirmResendInvite = async (email: string) => {
    if (!project?.id || resendingInvite) return
    if (!inviteGate.ok) {
      const msg =
        inviteGate.reason === 'sending'
          ? "Invitation en cours d'envoi…"
          : formatRetryAfterMessage(inviteGate.retryAfterMs ?? 60_000)
      setInviteFeedback(msg)
      return
    }
    setResendingInvite(true)
    setInviteFeedback(null)
    try {
      const result = await sendProjectInviteEmail({
        projectId: project.id,
        resend: true,
        clientEmail: email,
      })
      setShowResendInviteModal(false)
      setInviteRetryAfterMs(null)
      setHasManualResend(true)
      setInviteToast(`Invitation renvoyée à ${result.recipient ?? email}`)
      window.setTimeout(() => setInviteToast(null), 3000)
      await loadProject()
    } catch (err) {
      if (err instanceof InviteRateLimitError) {
        setInviteRetryAfterMs(err.retryAfterMs)
        setInviteFeedback(err.message)
      } else {
        setInviteFeedback(err instanceof Error ? err.message : 'Renvoi impossible.')
      }
    } finally {
      setResendingInvite(false)
    }
  }

  const layoutTitle = project?.name?.trim() || project?.client_name || 'Projet'
  const clientJoin = useMemo(() => {
    if (!project?.clients) return null
    return Array.isArray(project.clients) ? project.clients[0] ?? null : project.clients
  }, [project?.clients])

  if (loading) {
    return (
      <DashboardLayout title="Projet" subtitle="Chargement…" maxWidth="7xl">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement du projet...</p>
      </DashboardLayout>
    )
  }

  if (error && !project) {
    return (
      <DashboardLayout title="Projet" maxWidth="7xl">
        <p className="text-sm font-body text-[var(--amber)]">{error}</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title={layoutTitle} maxWidth="7xl">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          {project ? (
            <>
              <ClientContactBlock
                email={project.client_email}
                phone={clientJoin?.phone}
                companyName={clientJoin?.company_name}
                address={
                  clientJoin
                    ? {
                        street: clientJoin.address_street,
                        postal: clientJoin.address_postal_code,
                        city: clientJoin.address_city,
                        country: clientJoin.address_country,
                      }
                    : null
                }
              />

              <div className="mt-5 flex items-center justify-between">
                <Badge
                  variant={project.derivedStatus ?? project.status}
                  className="normal-case tracking-normal"
                />
                <p className="text-xs font-body text-[var(--ink-muted)]">Créé le {createdAtLabel}</p>
              </div>

              {project.invite_status && shouldShowResendInvite({ projectStatus: project.status }) ? (
                <div
                  className={`mt-4 rounded-[var(--radius-sm)] border px-3 py-2 text-xs font-body ${
                    shouldHighlightResendInvite({
                      inviteStatus: project.invite_status,
                      lastPortalVisitAt: project.last_portal_visit_at,
                    })
                      ? 'border-[var(--amber)] bg-[var(--amber-soft)] text-[var(--ink)]'
                      : 'border-[var(--border)] bg-[var(--surface-warm)] text-[var(--ink-soft)]'
                  }`}
                  role="status"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>
                      {
                        inviteBannerLabel({
                          inviteStatus: project.invite_status,
                          inviteSentAt: project.invite_sent_at,
                          inviteError: project.invite_error,
                          hasManualResend,
                        }).text
                      }
                    </p>
                    <button
                      type="button"
                      className={`shrink-0 rounded-[var(--radius-sm)] px-2.5 py-1 font-medium disabled:opacity-50 ${
                        shouldHighlightResendInvite({
                          inviteStatus: project.invite_status,
                          lastPortalVisitAt: project.last_portal_visit_at,
                        })
                          ? 'bg-[var(--accent)] text-[var(--white)]'
                          : 'border border-[var(--border)] bg-[var(--white)] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                      }`}
                      title={
                        !inviteGate.ok && inviteGate.retryAfterMs
                          ? formatRetryAfterMessage(inviteGate.retryAfterMs)
                          : !inviteGate.ok
                            ? formatRetryAfterMessage(60_000)
                            : undefined
                      }
                      onClick={() => setShowResendInviteModal(true)}
                      disabled={resendingInvite || !inviteGate.ok}
                    >
                      Renvoyer l&apos;invitation
                    </button>
                  </div>
                  {inviteFeedback ? (
                    <p className="mt-1 text-[var(--amber)]">{inviteFeedback}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-6 h-2 rounded-full bg-[var(--surface-warm)]">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
                Progression globale : {completedCount}/{totalCount} étapes
              </p>

              {bottleneck &&
              bottleneck.owner === 'agency' &&
              firstClientAction &&
              firstClientAction.label !== bottleneck.label ? (
                <p
                  className={`mt-3 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-body ${
                    isBottleneckStale(bottleneck)
                      ? 'bg-[var(--amber-soft)] font-semibold text-[var(--amber)]'
                      : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  }`}
                >
                  À valider par vous : {bottleneck.label}
                  {formatBottleneckAge(bottleneck.since)
                    ? ` · ${formatBottleneckAge(bottleneck.since)}`
                    : ''}
                  {' · '}
                  Côté client : {firstClientAction.label} (
                  {isRejected(firstClientAction) ? 'à corriger' : 'à envoyer'})
                </p>
              ) : bottleneck ? (
                <p
                  className={`mt-3 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-body ${
                    isBottleneckStale(bottleneck)
                      ? 'bg-[var(--amber-soft)] font-semibold text-[var(--amber)]'
                      : bottleneck.owner === 'agency'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'bg-[var(--surface-warm)] text-[var(--ink-soft)]'
                  }`}
                >
                  Étape bloquante — {formatBottleneckLabel(bottleneck)}
                </p>
              ) : firstClientAction ? (
                <p className="mt-3 rounded-[var(--radius-sm)] bg-[var(--surface-warm)] px-3 py-2 text-xs font-body text-[var(--ink-soft)]">
                  Côté client : {firstClientAction.label} (
                  {isRejected(firstClientAction) ? 'à corriger' : 'à envoyer'})
                </p>
              ) : null}

              {awaitingReviewCount > 0 ? (
                <p className="mt-3 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-body text-[var(--accent)]">
                  {awaitingReviewCount} élément{awaitingReviewCount > 1 ? 's' : ''} transmis
                  {awaitingReviewCount > 1 ? ' attendent' : ' attend'} votre validation.
                </p>
              ) : null}

              {unreachableClient ? (
                <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--status-blocked-border)] bg-[var(--status-blocked-soft)] px-3 py-3">
                  <p className="text-xs font-body font-semibold text-[var(--status-blocked)]">
                    Client injoignable — à appeler
                  </p>
                  <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                    {consecutiveAutoReminders} relance
                    {consecutiveAutoReminders > 1 ? 's' : ''} auto sans réponse (plafond{' '}
                    {reminderMaxPerProject}). Les relances auto sont suspendues.
                  </p>
                  <Button
                    className="mt-2"
                    onClick={handleResetReminderCap}
                    disabled={resettingCap}
                  >
                    {resettingCap
                      ? 'Réarmement…'
                      : 'J’ai contacté le client — relancer à nouveau'}
                  </Button>
                </div>
              ) : null}

              {project.last_reminder_sent_at ? (
                <p className="mt-6 text-sm font-body text-[var(--ink-soft)]">
                  Dernière relance {formatRelative(project.last_reminder_sent_at)}
                </p>
              ) : (
                <p className="mt-6 text-sm font-body text-[var(--ink-muted)]">
                  Aucune relance envoyée pour l'instant.
                </p>
              )}

              <span
                className="mt-3 inline-block"
                title={
                  aiRemindersEnabled && clientActionLabels.length === 0
                    ? 'Rien à demander au client : des éléments attendent votre validation'
                    : undefined
                }
              >
                <Button
                  onClick={handleSendReminder}
                  disabled={
                    reminderDisabled ||
                    (aiRemindersEnabled && clientActionLabels.length === 0)
                  }
                >
                  {sendingReminder
                    ? aiRemindersEnabled
                      ? 'Génération du brouillon…'
                      : 'Envoi…'
                    : aiRemindersEnabled
                      ? 'Générer une relance IA'
                      : 'Envoyer une relance'}
                </Button>
              </span>
              {aiRemindersEnabled && clientActionLabels.length === 0 && !allSettled ? (
                <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
                  Rien à demander au client : des éléments attendent votre validation.
                </p>
              ) : null}
              {allSettled ? (
                <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
                  Checklist complétée — plus besoin de relancer.
                </p>
              ) : null}
              {reminderFeedback ? (
                <p className="mt-2 text-sm font-body text-[var(--mint)]">{reminderFeedback}</p>
              ) : null}
              {error ? (
                <p className="mt-2 text-sm font-body text-[var(--amber)]">{error}</p>
              ) : null}

              {reminderLogs.length > 0 ? (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Historique des relances</p>
                  <ul className="mt-2 space-y-1.5">
                    {reminderLogs.map((log) => (
                      <li key={log.id} className="flex items-center justify-between gap-2 text-xs font-body text-[var(--ink-muted)]">
                        <span>{formatRelative(log.sent_at)}</span>
                        <span className={`rounded-full px-2 py-0.5 ${log.source === 'auto' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--surface-warm)] text-[var(--ink-soft)]'}`}>
                          {log.source === 'auto' ? 'Auto' : 'Manuelle'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {paymentLifecycle ? (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Paiement</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-body ${
                        paymentLifecycle === 'paid'
                          ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                          : paymentLifecycle === 'failed'
                            ? 'bg-[var(--amber-soft)] text-[var(--amber)]'
                            : 'bg-[var(--surface-warm)] text-[var(--ink-soft)]'
                      }`}
                    >
                      {paymentLifecycle === 'paid'
                        ? 'Payé par le client'
                        : PAYMENT_LIFECYCLE_LABELS[paymentLifecycle]}
                    </span>
                  </div>
                  {!editingPrice ? (
                    <div className="mt-2 flex items-baseline gap-3">
                      <p className="font-display text-2xl font-bold text-[var(--ink)]">
                        {formatEuro(project.price)}
                      </p>
                      {priceEditable ? (
                        <button
                          type="button"
                          onClick={startEditPrice}
                          className="text-xs font-body text-[var(--accent)] underline"
                        >
                          Modifier
                        </button>
                      ) : paymentLifecycle === 'paid' || paymentLifecycle === 'refunded' ? (
                        <span className="text-xs font-body text-[var(--ink-muted)]">
                          Montant verrouillé après paiement
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <label className="block" htmlFor="project-price-draft">
                        <span className="text-xs font-body font-medium text-[var(--ink-soft)]">
                          Nouveau montant (€)
                        </span>
                        <Input
                          ref={priceInputRef}
                          id="project-price-draft"
                          type="number"
                          min={0.01}
                          step={0.01}
                          className="mt-1"
                          value={priceDraft}
                          onChange={(e) => {
                            setPriceDraft(e.target.value)
                            if (priceFieldError) setPriceFieldError(null)
                          }}
                          disabled={savingPrice}
                          invalid={Boolean(priceFieldError)}
                          aria-describedby={
                            priceFieldError ? 'project-price-draft-error' : undefined
                          }
                        />
                      </label>
                      {priceFieldError ? (
                        <p
                          id="project-price-draft-error"
                          role="alert"
                          className="text-xs font-body text-[var(--amber)]"
                        >
                          {priceFieldError}
                        </p>
                      ) : null}
                      {needsCheckoutInvalidate ? (
                        <p className="text-xs font-body text-[var(--ink-muted)]">
                          Le lien actuel sera désactivé ; un nouveau lien sera créé au nouveau
                          montant.
                        </p>
                      ) : null}
                      {project.last_payment_email_sent_at ? (
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-[var(--accent)]"
                            checked={resendPaymentEmail}
                            onChange={(e) => setResendPaymentEmail(e.target.checked)}
                            disabled={savingPrice}
                          />
                          <span className="text-xs font-body text-[var(--ink-soft)]">
                            Renvoyer le nouveau lien au client
                          </span>
                        </label>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void handleSavePrice()} disabled={savingPrice}>
                          {savingPrice ? 'Enregistrement…' : 'Enregistrer'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingPrice(false)
                            setPriceFieldError(null)
                          }}
                          disabled={savingPrice}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  )}

                  {paymentLifecycle === 'link_sent' && project.last_payment_email_sent_at ? (
                    <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                      Lien envoyé {formatRelative(project.last_payment_email_sent_at)}
                    </p>
                  ) : null}

                  {paymentLifecycle === 'link_created' ? (
                    <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                      Lien de paiement créé — pas encore envoyé par email.
                    </p>
                  ) : null}

                  {paymentLifecycle === 'not_available' ? (
                    <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
                      {paymentUnlockInfo.lockMessage ??
                        'Le paiement se débloque quand les étapes précédentes obligatoires sont soumises (contrat signé inclus).'}
                    </p>
                  ) : null}

                  {canRequestPayment ? (
                    <>
                      <Button className="mt-3" onClick={handleSendPaymentLink} disabled={sendingPayment}>
                        {sendingPayment
                          ? 'Envoi…'
                          : paymentLifecycle === 'link_sent'
                            ? 'Renvoyer le lien de paiement'
                            : paymentLifecycle === 'link_created'
                              ? 'Envoyer le lien par email'
                              : 'Envoyer le lien de paiement'}
                      </Button>
                      {project.stripe_checkout_url ? (
                        <button
                          onClick={handleCopyPaymentLink}
                          className="mt-2 block text-xs font-body text-[var(--ink-muted)] underline"
                        >
                          Copier le lien de paiement
                        </button>
                      ) : null}
                    </>
                  ) : null}

                  {paymentLifecycle === 'paid' ? (
                    <>
                      <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
                        Le virement vers votre compte bancaire est géré automatiquement par Stripe.
                        Consultez votre espace Stripe pour le détail.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenStripeDashboard}
                        disabled={openingStripe}
                        className="mt-2 block text-xs font-body text-[var(--accent)] underline disabled:opacity-50"
                      >
                        {openingStripe ? 'Ouverture…' : 'Voir dans Stripe →'}
                      </button>
                    </>
                  ) : null}

                  {paymentLifecycle === 'failed' ? (
                    <p className="mt-2 text-xs font-body text-[var(--amber)]">
                      Le dernier paiement a échoué. Vous pouvez renvoyer un lien dès que le paiement
                      est débloqué.
                    </p>
                  ) : null}

                  {paymentLifecycle === 'refunded' ? (
                    <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
                      Paiement remboursé intégralement.
                    </p>
                  ) : null}

                  {paymentFeedback ? (
                    <p className="mt-2 text-sm font-body text-[var(--mint)]">{paymentFeedback}</p>
                  ) : null}
                  {paymentError ? (
                    <p className="mt-2 text-sm font-body text-[var(--amber)]">{paymentError}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Google Drive</p>
                {project.google_drive_folder_url ? (
                  <>
                    <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                      {project.google_drive_sync_status === 'partial'
                        ? 'Documents partiellement synchronisés vers Drive.'
                        : project.google_drive_files_synced_at
                          ? 'Documents, contrats signés et récap copiés dans le dossier.'
                          : 'Créé automatiquement à la fin de l\u2019onboarding.'}
                    </p>
                    <a
                      href={project.google_drive_folder_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-body text-[var(--accent)] underline"
                    >
                      Ouvrir le dossier client →
                    </a>
                    {project.google_drive_sync_status === 'partial' ? (
                      <Button
                        variant="secondary"
                        className="mt-3 block"
                        onClick={handleCreateDriveFolder}
                        disabled={syncingDrive}
                      >
                        {syncingDrive ? 'Synchronisation…' : 'Relancer la synchronisation'}
                      </Button>
                    ) : null}
                  </>
                ) : project.status === 'completed' ? (
                  <>
                    <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                      Aucun dossier Drive pour ce projet.
                    </p>
                    <Button className="mt-3" onClick={handleCreateDriveFolder} disabled={syncingDrive}>
                      {syncingDrive ? 'Synchronisation…' : 'Synchroniser vers Drive'}
                    </Button>
                  </>
                ) : (
                  <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                    Le dossier sera créé automatiquement à la fin de l&apos;onboarding (si Google Drive est connecté).
                  </p>
                )}
                {driveFeedback ? (
                  <p className="mt-2 text-sm font-body text-[var(--mint)]">{driveFeedback}</p>
                ) : null}
                {driveError ? (
                  <p className="mt-2 text-sm font-body text-[var(--amber)]">{driveError}</p>
                ) : null}
              </div>
            </>
          ) : null}
        </Card>

        {project ? (
          <ChecklistReviewPanel
            projectId={project.id}
            items={items}
            signatureProofs={signatureProofs}
            onReviewed={loadProject}
            aiRemindersEnabled={aiRemindersEnabled}
          />
        ) : null}
      </div>

      {project ? (
        <div className="mt-4 space-y-4">
          <SmartRemindersPanel
            key={smartRemindersKey}
            projectId={project.id}
            aiEnabled={aiRemindersEnabled}
            clientActionLabels={clientActionLabels}
            onSent={loadProject}
            onRequestGenerate={async () => {
              await handleSendReminder()
            }}
          />
          <ExtractionReviewPanel projectId={project.id} />
          <ClientActivityTimeline key={project.id} events={projectActivity} />
          <ContractGeneratorPanel
            projectId={project.id}
            aiContractsEnabled={aiContractsEnabled}
            checklistContext={items
              .map((item) => item.label?.trim())
              .filter((label): label is string => Boolean(label))}
          />
        </div>
      ) : null}

      {project && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="rounded-[var(--radius-sm)] border border-[#EF4444] bg-transparent px-5 py-2.5 text-sm font-body font-medium text-[#EF4444] transition hover:bg-[#FEF2F2]"
          >
            🗑 Supprimer ce projet
          </button>
        </div>
      )}

      {showDeleteModal && project && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/50 px-4">
          <Card className="w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-[var(--ink)]">Supprimer ce projet ?</h2>
            <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
              Le projet de <strong>{project.client_name}</strong> sera définitivement supprimé ainsi que tous ses documents et étapes.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={deleteLoading}>
                Annuler
              </Button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDelete}
                className="rounded-[var(--radius-sm)] bg-[#EF4444] px-5 py-2.5 text-sm font-body font-medium text-white transition hover:bg-[#DC2626] disabled:opacity-50"
              >
                {deleteLoading ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </Card>
        </div>
      )}

      {showResendInviteModal && project ? (
        <ResendInviteModal
          email={project.client_email}
          hasClientRecord={Boolean(project.client_id)}
          submitting={resendingInvite}
          onClose={() => setShowResendInviteModal(false)}
          onConfirm={(email) => void handleConfirmResendInvite(email)}
        />
      ) : null}

      {inviteToast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2.5 text-sm font-body text-[var(--white)] shadow-lg">
          {inviteToast}
        </div>
      ) : null}
    </DashboardLayout>
  )
}
