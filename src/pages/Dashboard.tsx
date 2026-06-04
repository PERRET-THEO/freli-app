import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { supabase } from '../lib/supabase'
import { formatRelative } from '../lib/formatRelative'
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
  last_reminder_sent_at: string | null
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
  lastReminderSentAt: string | null
  lastReminderSource: 'auto' | 'manual' | null
  completedCount: number
  totalCount: number
  progress: number
}

type ReminderLogRow = {
  project_id: string
  source: 'auto' | 'manual'
  sent_at: string
}

const AVATAR_PALETTE = [
  'bg-[var(--accent)]',
  'bg-[var(--mint)]',
  'bg-[var(--amber)]',
  'bg-[#F472B6]',
  'bg-[#60A5FA]',
  'bg-[#A78BFA]',
]

function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '··'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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
  const [autoRemindersThisMonth, setAutoRemindersThisMonth] = useState(0)
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
        navigate('/signin', { replace: true })
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
        .select('id, client_name, client_email, status, token, created_at, last_reminder_sent_at, clients(company_name, phone)')
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

      const { data: reminderRows } = await supabase
        .from('project_reminder_logs')
        .select('project_id, source, sent_at')
        .in('project_id', projectIds)
        .order('sent_at', { ascending: false })

      const latestReminderByProject = new Map<string, 'auto' | 'manual'>()
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      let autoCount = 0
      for (const row of (reminderRows ?? []) as ReminderLogRow[]) {
        if (!latestReminderByProject.has(row.project_id)) {
          latestReminderByProject.set(row.project_id, row.source)
        }
        if (row.source === 'auto' && new Date(row.sent_at) >= monthStart) {
          autoCount += 1
        }
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
          lastReminderSentAt: project.last_reminder_sent_at,
          lastReminderSource: latestReminderByProject.get(project.id) ?? null,
          completedCount: counts.completed,
          totalCount: counts.total,
          progress,
        }
      })

      setProjects(mapped)
      setAutoRemindersThisMonth(autoCount)
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
  const pendingProjects = projects.filter((project) => project.status === 'pending').length
  const averageCompletion = projects.length
    ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
    : 0

  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const isThisMonth = (iso: string) => {
    const d = new Date(iso)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  }

  const completedThisMonth = projects.filter(
    (project) => project.status === 'completed' && isThisMonth(project.createdAt),
  ).length
  const clientsThisMonth = projects.filter((project) => isThisMonth(project.createdAt)).length

  // Chaque onboarding complété = ~3h économisées (promesse landing)
  // + chaque relance AUTO envoyée ce mois = ~10 min économisées (les relances
  // manuelles ne comptent pas dans la promesse "Freli relance pour vous").
  const remindersThisMonth = autoRemindersThisMonth
  const hoursSavedThisMonth = completedThisMonth * 3 + Math.round((remindersThisMonth * 10) / 60)

  const recentAutoReminders = [...projects]
    .filter((p) => p.lastReminderSentAt && p.lastReminderSource === 'auto')
    .sort(
      (a, b) =>
        new Date(b.lastReminderSentAt as string).getTime() -
        new Date(a.lastReminderSentAt as string).getTime(),
    )
    .slice(0, 3)

  const urgentNeedsAction = projects.filter(
    (p) =>
      p.status !== 'completed' &&
      now - new Date(p.createdAt).getTime() > 48 * 60 * 60 * 1000 &&
      (!p.lastReminderSentAt ||
        now - new Date(p.lastReminderSentAt).getTime() > 72 * 60 * 60 * 1000),
  ).length

  // Sous-titre narratif qui raconte l'état du jour (promesse "intuitif")
  const narrativeSubtitle = (() => {
    if (projects.length === 0) return 'Créez votre premier onboarding en moins de 2 minutes.'
    if (urgentNeedsAction > 0) {
      return `${urgentNeedsAction} projet${urgentNeedsAction > 1 ? 's attendent' : ' attend'} une attention de votre part.`
    }
    if (remindersThisMonth > 0 && activeProjects > 0) {
      return `Freli a relancé ${remindersThisMonth} client${remindersThisMonth > 1 ? 's' : ''} pour vous. Tout avance sans effort.`
    }
    if (activeProjects > 0) {
      return `${activeProjects} projet${activeProjects > 1 ? 's' : ''} avance${activeProjects > 1 ? 'nt' : ''} sans vous aujourd'hui.`
    }
    if (pendingProjects > 0) {
      return `${pendingProjects} projet${pendingProjects > 1 ? 's' : ''} en attente de votre client.`
    }
    return 'Tout est à jour. Belle journée ✨'
  })()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement du dashboard...</p>
      </div>
    )
  }

  return (
    <DashboardLayout>
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
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
                Bonjour, {firstName} 👋
              </h1>
              <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
                {narrativeSubtitle}
              </p>
            </div>
            <Link to="/dashboard/new">
              <Button>+ Nouveau projet</Button>
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

          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="relative overflow-hidden p-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                  Projets actifs
                </p>
                {activeProjects > 0 && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                  </span>
                )}
              </div>
              <p className="mt-2 font-display text-3xl font-extrabold text-[var(--ink)]">
                {activeProjects}
              </p>
              <p className="mt-1 text-[11px] font-body text-[var(--ink-muted)]">
                {pendingProjects > 0 ? `+${pendingProjects} en attente` : 'aucun en attente'}
              </p>
            </Card>

            <Card className="relative overflow-hidden p-5">
              <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                Taux de complétion
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="font-display text-3xl font-extrabold text-[var(--ink)]">
                  {averageCompletion}%
                </p>
                {averageCompletion >= 80 && (
                  <span className="font-display text-[10px] font-bold text-[var(--mint)]">↑</span>
                )}
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-warm)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all"
                  style={{ width: `${averageCompletion}%` }}
                />
              </div>
            </Card>

            <Card className="relative overflow-hidden p-5">
              <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                Clients ce mois
              </p>
              <p className="mt-2 font-display text-3xl font-extrabold text-[var(--ink)]">
                {clientsThisMonth}
              </p>
              <p className="mt-1 text-[11px] font-body text-[var(--ink-muted)]">
                {completedThisMonth} complété{completedThisMonth > 1 ? 's' : ''}
              </p>
            </Card>

            <Card className="relative overflow-hidden border border-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent-soft)] to-[var(--white)] p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--accent)]">
                  ⏱ Temps gagné
                </p>
              </div>
              <p className="mt-2 font-display text-3xl font-extrabold text-[var(--ink)]">
                {hoursSavedThisMonth}
                <span className="text-lg">h</span>
              </p>
              <p className="mt-1 text-[11px] font-body text-[var(--ink-muted)]">
                ce mois, grâce à l&apos;automatisation
              </p>
            </Card>
          </section>

          {recentAutoReminders.length > 0 && (
            <section className="mt-4 rounded-[var(--radius-md)] border border-[var(--accent)]/20 bg-gradient-to-r from-[var(--accent-soft)] to-transparent px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--white)] text-base shadow-sm">
                  🤖
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[13px] font-bold text-[var(--ink)]">
                    Freli travaille pour vous
                  </p>
                  <p className="mt-0.5 truncate text-[12px] font-body text-[var(--ink-muted)]">
                    Dernière auto-relance : <span className="font-semibold text-[var(--ink)]">{recentAutoReminders[0].clientName}</span>
                    {' · '}
                    {formatRelative(recentAutoReminders[0].lastReminderSentAt, now)}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--white)] px-2.5 py-1 font-display text-[11px] font-bold text-[var(--accent)]">
                  {remindersThisMonth} ce mois
                </span>
              </div>
            </section>
          )}

          {filteredProjects.length === 0 ? (
            <Card className="mt-8 flex flex-col items-center justify-center py-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl">
                📂
              </div>
              <h2 className="mt-4 font-display text-2xl font-semibold text-[var(--ink)]">
                {projects.length === 0 ? 'Créez votre premier onboarding' : 'Aucun projet dans cette vue'}
              </h2>
              <p className="mt-2 max-w-md text-sm font-body text-[var(--ink-muted)]">
                {projects.length === 0
                  ? 'En 2 minutes : un lien à envoyer, des relances automatiques, et vous voilà débarrassé de 3h de travail.'
                  : 'Changez de filtre pour voir les autres projets.'}
              </p>
              {projects.length === 0 && (
                <Link to="/dashboard/new" className="mt-5 inline-block">
                  <Button>+ Créer mon premier projet</Button>
                </Link>
              )}
            </Card>
          ) : (
            <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => {
                const isNew =
                  project.status !== 'completed' &&
                  now - new Date(project.createdAt).getTime() < 2 * 60 * 60 * 1000
                const reminderFreshness = project.lastReminderSentAt
                  ? now - new Date(project.lastReminderSentAt).getTime()
                  : Infinity
                const reminderSentRecently = reminderFreshness < 72 * 60 * 60 * 1000
                const ageMs = now - new Date(project.createdAt).getTime()
                const needsAction =
                  project.status !== 'completed' &&
                  ageMs > 48 * 60 * 60 * 1000 &&
                  !reminderSentRecently
                const totalSteps = Math.max(project.totalCount, 1)
                const segments = Math.min(totalSteps, 8)
                const completedSegments = Math.round(
                  (project.completedCount / totalSteps) * segments,
                )
                const lastActivityIso =
                  reminderSentRecently && project.lastReminderSentAt
                    ? project.lastReminderSentAt
                    : project.createdAt
                const reminderKindLabel =
                  project.lastReminderSource === 'manual' ? 'Relance manuelle' : 'Relance auto'
                const activityLabel = reminderSentRecently
                  ? `${reminderKindLabel} ${formatRelative(project.lastReminderSentAt, now)}`
                  : `Créé ${formatRelative(project.createdAt, now)}`

                return (
                  <div key={project.id} className="relative">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/dashboard/project/${project.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate(`/dashboard/project/${project.id}`)
                        }
                      }}
                      className={`relative cursor-pointer rounded-[var(--radius-lg)] bg-[var(--white)] p-5 shadow-[0_2px_16px_rgba(13,15,20,0.06),0_0_0_1px_rgba(13,15,20,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(13,15,20,0.08),0_0_0_1px_rgba(13,15,20,0.06)] ${
                        project.status === 'in_progress'
                          ? 'ring-1 ring-[var(--accent)]/20'
                          : ''
                      }`}
                    >
                      {isNew && (
                        <span className="absolute -top-2 left-4 inline-flex items-center gap-1 rounded-full bg-[var(--mint)] px-2 py-[2px] font-display text-[10px] font-extrabold uppercase tracking-wide text-[var(--ink)] shadow-sm">
                          ✨ Nouveau
                        </span>
                      )}

                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${avatarColor(project.id)} font-display text-sm font-extrabold text-[var(--white)]`}
                        >
                          {getInitials(project.clientName)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h2 className="truncate font-display text-[17px] font-bold text-[var(--ink)]">
                                {project.clientName}
                              </h2>
                              {project.companyName && (
                                <p className="mt-0.5 truncate text-[11px] font-body font-semibold text-[var(--accent)]">
                                  {project.companyName}
                                </p>
                              )}
                              <p className="group/tip relative mt-0.5 truncate text-xs font-body text-[var(--ink-muted)]">
                                {project.clientEmail}
                                {project.clientPhone && (
                                  <span className="pointer-events-none absolute -top-8 left-0 z-10 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--ink)] px-2 py-1 text-xs text-[var(--white)] opacity-0 transition group-hover/tip:opacity-100">
                                    {project.clientPhone}
                                  </span>
                                )}
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              {project.status === 'in_progress' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-[3px] font-display text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                                  </span>
                                  En cours
                                </span>
                              ) : (
                                <Badge variant={project.status} />
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMenuOpenId(menuOpenId === project.id ? null : project.id)
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-muted)] transition hover:bg-[var(--surface-warm)] hover:text-[var(--ink)]"
                                aria-label="Plus d'options"
                              >
                                ⋯
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between text-[11px] font-body text-[var(--ink-muted)]">
                          <span className="font-display font-bold text-[var(--ink)]">
                            {project.completedCount}/{project.totalCount} étapes
                          </span>
                          <span>{project.progress}%</span>
                        </div>
                        {project.totalCount > 0 ? (
                          <div className="flex gap-1">
                            {Array.from({ length: segments }).map((_, i) => (
                              <div
                                key={i}
                                className={`h-1.5 flex-1 rounded-full transition-colors ${
                                  i < completedSegments
                                    ? 'bg-[var(--accent)]'
                                    : 'bg-[var(--surface-warm)]'
                                }`}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="h-1.5 rounded-full bg-[var(--surface-warm)]" />
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {reminderSentRecently && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--mint-soft)] px-2 py-[3px] font-display text-[10px] font-bold uppercase tracking-wide text-[var(--mint)]">
                            🤖 Auto-relance envoyée
                          </span>
                        )}
                        {needsAction && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--amber-soft)] px-2 py-[3px] font-display text-[10px] font-bold uppercase tracking-wide text-[var(--amber)]">
                            ⚠️ À relancer
                          </span>
                        )}
                        <span className="ml-auto truncate text-[11px] font-body text-[var(--ink-muted)]">
                          {activityLabel}
                        </span>
                      </div>

                      <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyLink(project.token)
                          }}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 text-[12px] font-body font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          🔗 Copier le lien
                        </button>
                        <Link
                          to={`/dashboard/project/${project.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--ink)] px-3 py-1.5 text-[12px] font-body font-semibold text-[var(--white)] transition hover:bg-[var(--ink-soft)]"
                        >
                          Ouvrir →
                        </Link>
                      </div>

                      <span className="sr-only">Dernière activité : {formatDate(lastActivityIso)}</span>
                    </div>

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
                )
              })}
            </section>
          )}

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
    </DashboardLayout>
  )
}
