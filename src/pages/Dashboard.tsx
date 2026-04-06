import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { supabase } from '../lib/supabase'
import { Badge, Button, Card } from '../components/ui'

type ProjectStatus = 'pending' | 'in_progress' | 'completed'
type StatusFilter = 'all' | ProjectStatus

type ProjectRecord = {
  id: string
  client_name: string
  client_email: string
  status: ProjectStatus
  token: string
  created_at: string
  clients?: { company_name: string | null; phone: string | null }[] | { company_name: string | null; phone: string | null } | null
}

type ChecklistCountRow = {
  project_id: string
  completed: boolean
}

type ProjectCardData = {
  id: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  companyName: string | null
  status: ProjectStatus
  token: string
  createdAt: string
  completedCount: number
  totalCount: number
  progress: number
}

const filterLabels: Record<StatusFilter, string> = {
  all: 'Tous',
  in_progress: 'En cours',
  pending: 'En attente',
  completed: 'Complétés',
}

export function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectCardData[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [deletingProject, setDeletingProject] = useState<ProjectCardData | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { canInstall, isStandalone, promptInstall, dismissBanner } = usePWAInstall()

  useEffect(() => {
    const getUserAndProjects = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) {
        navigate('/auth', { replace: true })
        return
      }
      setEmail(data.user.email ?? null)

      const { data: agencyData } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (!agencyData?.id) {
        setProjects([])
        setLoading(false)
        return
      }

      const { data: projectRows, error: projectsError } = await supabase
        .from('projects')
        .select('id, client_name, client_email, status, token, created_at, clients(company_name, phone)')
        .eq('agency_id', agencyData.id)
        .order('created_at', { ascending: false })

      if (projectsError) {
        setLoading(false)
        return
      }

      const rawProjects = (projectRows ?? []) as ProjectRecord[]
      if (!rawProjects.length) {
        setProjects([])
        setLoading(false)
        return
      }

      const projectIds = rawProjects.map((project) => project.id)
      const { data: checklistRows } = await supabase
        .from('checklist_items')
        .select('project_id, completed')
        .in('project_id', projectIds)

      const countsByProject = new Map<string, { total: number; completed: number }>()
      for (const row of (checklistRows ?? []) as ChecklistCountRow[]) {
        const current = countsByProject.get(row.project_id) ?? { total: 0, completed: 0 }
        current.total += 1
        if (row.completed) current.completed += 1
        countsByProject.set(row.project_id, current)
      }

      const mapped = rawProjects.map((project) => {
        const counts = countsByProject.get(project.id) ?? { total: 0, completed: 0 }
        const progress = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0
        const rawClients = project.clients
        const clientJoin = Array.isArray(rawClients) ? rawClients[0] ?? null : rawClients ?? null
        return {
          id: project.id,
          clientName: project.client_name,
          clientEmail: project.client_email,
          clientPhone: clientJoin?.phone ?? null,
          companyName: clientJoin?.company_name ?? null,
          status: project.status,
          token: project.token,
          createdAt: project.created_at,
          completedCount: counts.completed,
          totalCount: counts.total,
          progress,
        }
      })

      setProjects(mapped)
      setLoading(false)
    }

    getUserAndProjects()
  }, [navigate])

  useEffect(() => {
    if (!menuOpenId) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpenId])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const handleCopyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/p/${token}`)
    showToast('Lien copié !')
    setMenuOpenId(null)
  }

  const handleDeleteProject = async () => {
    if (!deletingProject) return
    setDeleteLoading(true)
    await supabase.from('checklist_items').delete().eq('project_id', deletingProject.id)
    await supabase.from('projects').delete().eq('id', deletingProject.id)
    setProjects((prev) => prev.filter((p) => p.id !== deletingProject.id))
    setDeleteLoading(false)
    setDeletingProject(null)
    showToast('Projet supprimé')
  }

  const firstName = useMemo(() => {
    if (!email) return 'Freelance'
    return email.split('@')[0].split(/[._-]/)[0]
  }, [email])

  const filteredProjects = useMemo(() => {
    const byFilter =
      filter === 'all' ? projects : projects.filter((project) => project.status === filter)

    return [...byFilter].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [projects, filter])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  const now = Date.now()
  const activeProjects = projects.filter((project) => project.status === 'in_progress').length
  const averageCompletion = projects.length
    ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
    : 0
  const completedThisMonth = projects.filter((project) => {
    const date = new Date(project.createdAt)
    const current = new Date()
    return (
      project.status === 'completed' &&
      date.getMonth() === current.getMonth() &&
      date.getFullYear() === current.getFullYear()
    )
  }).length

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  const sidebarNavClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-[var(--radius-sm)] px-3 py-2 text-sm font-body transition ${
      isActive
        ? 'bg-[var(--ink-soft)] text-[var(--white)]'
        : 'text-[var(--surface-warm)] hover:bg-[var(--ink-soft)]'
    }`

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement du dashboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-72 md:flex-col md:bg-[var(--ink)] md:p-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] font-display text-sm font-extrabold tracking-tight text-[var(--white)]">
              Fr
            </div>
            <span className="font-display text-2xl font-extrabold tracking-tighter text-[var(--white)]">
              Freli
            </span>
          </Link>

          <nav className="mt-10 space-y-2">
            <NavLink to="/dashboard" end className={sidebarNavClass}>
              Dashboard
            </NavLink>
            <NavLink to="/dashboard/clients" className={sidebarNavClass}>
              Clients
            </NavLink>
            <NavLink to="/dashboard/new" className={sidebarNavClass}>
              Nouveau projet
            </NavLink>
            <NavLink to="/dashboard/templates" className={sidebarNavClass}>
              Contrats
            </NavLink>
            <NavLink to="/dashboard/integrations" className={sidebarNavClass}>
              Intégrations
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-left text-sm font-body text-[var(--white)] transition hover:border-[var(--accent)]"
            >
              Déconnexion
            </button>
          </nav>
        </div>

        <div className="shrink-0 space-y-3 border-t border-[var(--ink-soft)] pt-4">
          <NavLink to="/dashboard/settings" className={sidebarNavClass}>
            Paramètres
          </NavLink>
          <div className="rounded-[var(--radius-sm)] bg-[var(--ink-soft)] px-3 py-2.5">
            <p className="text-[10px] font-body uppercase tracking-wide text-[var(--ink-muted)]">
              Connecté
            </p>
            <p className="mt-0.5 break-all text-xs font-body leading-snug text-[var(--white)]">
              {email ?? '—'}
            </p>
          </div>
        </div>
      </aside>

      <div className="mx-auto max-w-7xl md:ml-72">
        <main className="w-full px-4 py-8 pb-24 sm:px-8 md:pb-8">
          {canInstall ? (
            <div className="mb-4 flex items-center justify-between rounded-[var(--radius-sm)] border border-[rgba(91,110,245,0.2)] bg-[var(--accent-soft)] px-4 py-3">
              <p className="font-body text-sm text-[var(--accent)]">
                📱 Installez Freli sur votre téléphone
              </p>
              <div className="flex items-center gap-2">
                <Button
                  className="px-3 py-2 text-xs"
                  onClick={() => {
                    promptInstall().then()
                  }}
                >
                  Installer
                </Button>
                <button
                  type="button"
                  onClick={dismissBanner}
                  className="h-8 w-8 rounded-full text-[var(--accent)] transition hover:bg-[var(--white)]"
                >
                  ×
                </button>
              </div>
            </div>
          ) : null}
          {isStandalone ? (
            <div className="mb-4 inline-flex items-center rounded-full bg-[var(--mint-soft)] px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wide text-[var(--mint)]">
              ✅ Installée
            </div>
          ) : null}

          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
                Bonjour, {firstName} 👋
              </h1>
              <p className="text-sm font-body text-[var(--ink-muted)]">
                Suivi rapide de tes onboardings clients.
              </p>
            </div>
            <Link to="/dashboard/new">
              <Button>Nouveau projet</Button>
            </Link>
          </header>

          <div className="mt-6 flex flex-wrap gap-2">
            {(Object.keys(filterLabels) as StatusFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-3 py-1.5 text-sm font-body transition ${
                  filter === key
                    ? 'bg-[var(--accent)] text-[var(--white)]'
                    : 'bg-[var(--white)] text-[var(--ink-soft)] border border-[var(--border)]'
                }`}
              >
                {filterLabels[key]}
              </button>
            ))}
          </div>

          <section className="mt-6 grid gap-3 md:grid-cols-3">
            <Card className="p-5">
              <p className="text-sm font-body text-[var(--ink-muted)]">Projets actifs</p>
              <p className="mt-2 font-display text-3xl font-extrabold text-[var(--ink)]">
                {activeProjects}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-body text-[var(--ink-muted)]">Taux de complétion moyen</p>
              <p className="mt-2 font-display text-3xl font-extrabold text-[var(--ink)]">
                {averageCompletion}%
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-body text-[var(--ink-muted)]">Projets complétés ce mois</p>
              <p className="mt-2 font-display text-3xl font-extrabold text-[var(--ink)]">
                {completedThisMonth}
              </p>
            </Card>
          </section>

          {filteredProjects.length === 0 ? (
            <Card className="mt-8 flex flex-col items-center justify-center py-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl">
                📂
              </div>
              <h2 className="mt-4 font-display text-2xl font-semibold text-[var(--ink)]">
                Créez votre premier onboarding
              </h2>
              <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
                Lancez un projet pour partager un lien client en quelques secondes.
              </p>
            </Card>
          ) : (
            <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => (
                <div key={project.id} className="relative">
                  <Card
                    className="cursor-pointer transition hover:-translate-y-0.5"
                    onClick={() => navigate(`/dashboard/project/${project.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
                        {project.clientName}
                      </h2>
                      <div className="flex items-center gap-2">
                        <Badge variant={project.status} />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenId(menuOpenId === project.id ? null : project.id)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-muted)] transition hover:bg-[var(--surface-warm)] hover:text-[var(--ink)]"
                        >
                          ⋯
                        </button>
                      </div>
                    </div>
                    {project.companyName && (
                      <p className="mt-0.5 text-xs font-body text-[var(--accent)]">{project.companyName}</p>
                    )}
                    <p className="group/tip relative mt-1 inline-block text-sm font-body text-[var(--ink-muted)]">
                      {project.clientEmail}
                      {project.clientPhone && (
                        <span className="pointer-events-none absolute -top-8 left-0 z-10 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--ink)] px-2 py-1 text-xs text-[var(--white)] opacity-0 transition group-hover/tip:opacity-100">
                          {project.clientPhone}
                        </span>
                      )}
                    </p>
                    <div className="mt-4 h-2 rounded-full bg-[var(--surface-warm)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
                      {project.completedCount}/{project.totalCount} étapes
                    </p>
                    <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                      Créé le {formatDate(project.createdAt)}
                    </p>
                    {project.status !== 'completed' &&
                    now - new Date(project.createdAt).getTime() > 48 * 60 * 60 * 1000 ? (
                      <p className="mt-2 inline-flex rounded-full bg-[var(--amber-soft)] px-2.5 py-1 text-xs font-display font-bold uppercase tracking-wide text-[var(--amber)]">
                        ⚠️ Relance suggérée
                      </p>
                    ) : null}
                  </Card>

                  {menuOpenId === project.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-4 top-14 z-20 w-52 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        className="w-full px-4 py-2 text-left text-sm font-body text-[var(--ink)] hover:bg-[var(--surface)]"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpenId(null)
                          navigate(`/dashboard/project/${project.id}`)
                        }}
                      >
                        👁 Voir le projet
                      </button>
                      <button
                        type="button"
                        className="w-full px-4 py-2 text-left text-sm font-body text-[var(--ink)] hover:bg-[var(--surface)]"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCopyLink(project.token)
                        }}
                      >
                        🔗 Copier le lien client
                      </button>
                      <hr className="my-1 border-[var(--border)]" />
                      <button
                        type="button"
                        className="w-full px-4 py-2 text-left text-sm font-body text-[#EF4444] hover:bg-[#FEF2F2]"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpenId(null)
                          setDeletingProject(project)
                        }}
                      >
                        🗑 Supprimer le projet
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around bg-[var(--ink)] md:hidden">
        <NavLink
          to="/dashboard"
          end
          className={({ isActive }) =>
            `text-2xl ${isActive ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.4)]'}`
          }
        >
          🏠
        </NavLink>
        <NavLink
          to="/dashboard/clients"
          className={({ isActive }) =>
            `text-2xl ${isActive ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.4)]'}`
          }
        >
          👥
        </NavLink>
        <NavLink
          to="/dashboard/new"
          className={({ isActive }) =>
            `text-2xl ${isActive ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.4)]'}`
          }
        >
          ➕
        </NavLink>
        <NavLink
          to="/dashboard/templates"
          className={({ isActive }) =>
            `text-2xl ${isActive ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.4)]'}`
          }
        >
          📄
        </NavLink>
        <NavLink
          to="/dashboard/integrations"
          className={({ isActive }) =>
            `text-2xl ${isActive ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.4)]'}`
          }
        >
          🔗
        </NavLink>
        <NavLink
          to="/dashboard/settings"
          className={({ isActive }) =>
            `text-2xl ${isActive ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.4)]'}`
          }
        >
          ⚙️
        </NavLink>
      </nav>

      {deletingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/50 px-4">
          <Card className="w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-[var(--ink)]">Supprimer ce projet ?</h2>
            <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
              Le projet de <strong>{deletingProject.clientName}</strong> sera définitivement supprimé ainsi que tous ses documents et étapes.
            </p>
            <div className="mt-5 flex gap-3">
              <Button variant="secondary" onClick={() => setDeletingProject(null)} disabled={deleteLoading}>
                Annuler
              </Button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDeleteProject}
                className="rounded-[var(--radius-sm)] bg-[#EF4444] px-5 py-2.5 text-sm font-body font-medium text-white transition hover:bg-[#DC2626] disabled:opacity-50"
              >
                {deleteLoading ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </Card>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm font-body text-[var(--white)] shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </div>
  )
}
