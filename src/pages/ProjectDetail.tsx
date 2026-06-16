import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { Badge, Button, Card } from '../components/ui'
import { sendProjectReminderEmail } from '../lib/resend'
import { sendPaymentLink } from '../lib/stripePayment'
import { syncProjectDriveFolder } from '../lib/googleDriveConnect'
import { openStripeExpressDashboard } from '../lib/stripeConnectDashboard'
import { getPaymentState, formatPriceEur, PAYMENT_STATE_LABELS } from '../lib/payments'
import { formatRelative } from '../lib/formatRelative'
import { supabase } from '../lib/supabase'

type ProjectRecord = {
  id: string
  client_name: string
  client_email: string
  status: 'pending' | 'in_progress' | 'completed'
  token: string
  created_at: string
  last_reminder_sent_at: string | null
  price: number | null
  payment_status: string | null
  stripe_checkout_url: string | null
  last_payment_email_sent_at: string | null
  google_drive_folder_url: string | null
  google_drive_files_synced_at: string | null
  google_drive_sync_status: 'synced' | 'partial' | 'failed' | null
  agencies?: { name: string | null } | { name: string | null }[] | null
}

type ChecklistItemRecord = {
  id: string
  label: string
  type: 'text' | 'file' | 'signature'
  completed: boolean
  value: string | null
  order_index: number
}

type ReminderLog = {
  id: string
  source: 'auto' | 'manual'
  sent_at: string
}

export function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [items, setItems] = useState<ChecklistItemRecord[]>([])
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([])
  const [sendingReminder, setSendingReminder] = useState(false)
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null)
  const [sendingPayment, setSendingPayment] = useState(false)
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [openingStripe, setOpeningStripe] = useState(false)
  const [syncingDrive, setSyncingDrive] = useState(false)
  const [driveFeedback, setDriveFeedback] = useState<string | null>(null)
  const [driveError, setDriveError] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadProject = useCallback(async () => {
    if (!id) {
      setError('Projet introuvable.')
      setLoading(false)
      return
    }

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, client_name, client_email, status, token, created_at, last_reminder_sent_at, price, payment_status, stripe_checkout_url, last_payment_email_sent_at, google_drive_folder_url, google_drive_files_synced_at, google_drive_sync_status, agencies(name)')
      .eq('id', id)
      .maybeSingle()

    if (projectError || !projectData) {
      setError('Projet introuvable.')
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

    const { data: logsData } = await supabase
      .from('project_reminder_logs')
      .select('id, source, sent_at')
      .eq('project_id', projectData.id)
      .order('sent_at', { ascending: false })
      .limit(10)

    setProject(projectData as ProjectRecord)
    setItems((checklistData ?? []) as ChecklistItemRecord[])
    setReminderLogs((logsData ?? []) as ReminderLog[])
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  const completedCount = items.filter((item) => item.completed).length
  const totalCount = items.length
  const progress = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  const createdAtLabel = useMemo(() => {
    if (!project?.created_at) return ''
    return new Date(project.created_at).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }, [project?.created_at])

  const getFileDownloadUrl = (path: string | null) => {
    if (!path) return '#'
    const { data } = supabase.storage.from('documents').getPublicUrl(path)
    return data.publicUrl
  }

  const allCompleted = totalCount > 0 && completedCount === totalCount
  const reminderDisabled = sendingReminder || project?.status === 'completed' || allCompleted

  const handleSendReminder = async () => {
    if (!project) return
    setSendingReminder(true)
    setReminderFeedback(null)
    setError(null)
    try {
      await sendProjectReminderEmail({ projectId: project.id })
      setReminderFeedback('Relance envoyée au client.')
      await loadProject()
    } catch (reason: unknown) {
      const exactError =
        reason instanceof Error ? reason.message : "Impossible d'envoyer la relance."
      setError(exactError)
    } finally {
      setSendingReminder(false)
    }
  }

  const paymentState = getPaymentState(project?.price, project?.payment_status)
  const canRequestPayment =
    paymentState === 'pending' && project?.status === 'completed'

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

  const layoutTitle = project?.client_name ?? 'Projet'
  const layoutSubtitle = project?.client_email

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
    <DashboardLayout title={layoutTitle} subtitle={layoutSubtitle} maxWidth="7xl">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          {project ? (
            <>
              <div className="flex items-center justify-between">
                <Badge variant={project.status} />
                <p className="text-xs font-body text-[var(--ink-muted)]">Créé le {createdAtLabel}</p>
              </div>

              <div className="mt-6 h-2 rounded-full bg-[var(--surface-warm)]">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
                Progression globale : {completedCount}/{totalCount} étapes
              </p>

              {project.last_reminder_sent_at ? (
                <p className="mt-6 text-sm font-body text-[var(--ink-soft)]">
                  Dernière relance {formatRelative(project.last_reminder_sent_at)}
                </p>
              ) : (
                <p className="mt-6 text-sm font-body text-[var(--ink-muted)]">
                  Aucune relance envoyée pour l'instant.
                </p>
              )}

              <Button className="mt-3" onClick={handleSendReminder} disabled={reminderDisabled}>
                {sendingReminder ? 'Envoi…' : 'Envoyer une relance'}
              </Button>
              {allCompleted ? (
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

              {paymentState !== 'none' ? (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Paiement</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-body ${paymentState === 'paid' ? 'bg-[var(--mint-soft)] text-[var(--mint)]' : 'bg-[var(--surface-warm)] text-[var(--ink-soft)]'}`}>
                      {paymentState === 'paid' ? 'Payé par le client' : PAYMENT_STATE_LABELS[paymentState]}
                    </span>
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold text-[var(--ink)]">
                    {formatPriceEur(project.price)}
                  </p>
                  {project.last_payment_email_sent_at ? (
                    <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                      Lien envoyé {formatRelative(project.last_payment_email_sent_at)}
                    </p>
                  ) : null}

                  {canRequestPayment ? (
                    <>
                      <Button className="mt-3" onClick={handleSendPaymentLink} disabled={sendingPayment}>
                        {sendingPayment ? 'Envoi…' : 'Renvoyer le lien de paiement'}
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
                  ) : paymentState === 'pending' ? (
                    <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
                      Le lien de paiement sera disponible une fois l'onboarding terminé.
                    </p>
                  ) : paymentState === 'paid' ? (
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

        <Card>
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
            Checklist
          </h2>
          <ul className="mt-4 space-y-3 text-sm font-body text-[var(--ink-soft)]">
            {items.map((item) => (
              <li key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-body text-sm text-[var(--ink)]">{item.label}</p>
                  <span className={item.completed ? 'text-[var(--mint)]' : 'text-[var(--ink-muted)]'}>
                    {item.completed ? '✓' : '○'}
                  </span>
                </div>

                {item.completed ? (
                  <div className="mt-2 text-xs font-body text-[var(--ink-muted)]">
                    {item.type === 'signature' ? (
                      <div className="space-y-1">
                        <p className="text-[var(--mint)]">✅ Contrat signé</p>
                        {item.value && (
                          <a
                            href={item.value}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--accent)] underline"
                          >
                            Voir le contrat signé →
                          </a>
                        )}
                      </div>
                    ) : item.type === 'file' && item.value ? (
                      <a
                        href={getFileDownloadUrl(item.value)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] underline"
                      >
                        Télécharger le fichier
                      </a>
                    ) : (
                      <p>{item.value ?? 'Valeur enregistrée'}</p>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>

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
    </DashboardLayout>
  )
}
