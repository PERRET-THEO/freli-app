import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card } from '../components/ui'
import { sendProjectReminderEmail } from '../lib/resend'
import { supabase } from '../lib/supabase'

type ProjectRecord = {
  id: string
  client_name: string
  client_email: string
  status: 'pending' | 'in_progress' | 'completed'
  token: string
  created_at: string
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

export function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [items, setItems] = useState<ChecklistItemRecord[]>([])
  const [reminderSent, setReminderSent] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    const loadProject = async () => {
      if (!id) {
        setError('Projet introuvable.')
        setLoading(false)
        return
      }

      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('id, client_name, client_email, status, token, created_at, agencies(name)')
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

      setProject(projectData as ProjectRecord)
      setItems((checklistData ?? []) as ChecklistItemRecord[])
      setLoading(false)
    }

    loadProject()
  }, [id])

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

  const handleSendReminder = () => {
    if (!project) return
    const agencyRelation = project.agencies
    const agencyName = Array.isArray(agencyRelation)
      ? (agencyRelation[0]?.name ?? 'Mon Agence')
      : (agencyRelation?.name ?? 'Mon Agence')

    sendProjectReminderEmail({
      projectId: project.id,
      token: project.token,
      clientEmail: project.client_email,
      clientName: project.client_name,
      agencyName,
    })
      .then(() => setReminderSent(true))
      .catch((reason: unknown) => {
        const exactError =
          reason instanceof Error ? reason.message : "Impossible d'envoyer la relance."
        setError(exactError)
      })
  }

  const handleDelete = async () => {
    if (!id) return
    setDeleteLoading(true)
    await supabase.from('checklist_items').delete().eq('project_id', id)
    await supabase.from('projects').delete().eq('id', id)
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-sm font-body text-[var(--ink-muted)] hover:text-[var(--accent)]"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="mx-auto mt-4 grid max-w-6xl gap-4 md:grid-cols-2">
        <Card>
          {loading ? (
            <p className="text-sm font-body text-[var(--ink-muted)]">Chargement du projet...</p>
          ) : error ? (
            <p className="text-sm font-body text-[var(--amber)]">{error}</p>
          ) : project ? (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)]">
                {project.client_name}
              </h1>
              <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
                {project.client_email}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <Badge variant={project.status} />
                <p className="text-xs font-body text-[var(--ink-muted)]">Créé le {createdAtLabel}</p>
              </div>

              <div className="mt-6 h-2 rounded-full bg-[var(--surface-warm)]">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
                Progression globale : {completedCount}/{totalCount} étapes
              </p>

              <Button className="mt-6" onClick={handleSendReminder}>
                Envoyer une relance
              </Button>
              {reminderSent ? (
                <p className="mt-2 text-sm font-body text-[var(--mint)]">
                  Relance envoyée au client.
                </p>
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
        <div className="mx-auto mt-8 max-w-6xl">
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
    </div>
  )
}
