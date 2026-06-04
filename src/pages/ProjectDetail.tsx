import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { Badge, Button, Card } from '../components/ui'
import { sendProjectReminderEmail } from '../lib/resend'
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
      .select('id, client_name, client_email, status, token, created_at, last_reminder_sent_at, agencies(name)')
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
            <div className="mt-5 flex gap-3">
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
