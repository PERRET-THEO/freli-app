import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActivityBanner } from '../components/dashboard/ActivityBanner'
import { DashboardSkeleton } from '../components/dashboard/DashboardSkeleton'
import { KpiGrid } from '../components/dashboard/KpiGrid'
import { ProjectCard } from '../components/dashboard/ProjectCard'
import { StatusFilterBar } from '../components/dashboard/StatusFilterBar'
import { useDashboardData } from '../components/dashboard/useDashboardData'
import type { ProjectCardData, StatusFilter } from '../components/dashboard/types'
import { DashboardLayout } from '../components/DashboardLayout'
import { useAgencySession } from '../contexts/AgencyContext'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { supabase } from '../lib/supabase'
import { Button, Card } from '../components/ui'

export function Dashboard() {
  const { displayName } = useAgencySession()
  const {
    loading,
    projects,
    removeProject,
    autoRemindersThisMonth,
    pendingExtractionProjects,
    draftReminderCount,
  } = useDashboardData()

  const [filter, setFilter] = useState<StatusFilter>('all')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [deletingProject, setDeletingProject] = useState<ProjectCardData | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const { canInstall, isStandalone, promptInstall, dismissBanner } = usePWAInstall()

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
    removeProject(deletingProject.id)
    setDeleteLoading(false)
    setDeletingProject(null)
    showToast('Projet supprimé')
  }

  const filteredProjects = useMemo(() => {
    const byFilter =
      filter === 'all' ? projects : projects.filter((project) => project.status === filter)
    return [...byFilter].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [projects, filter])

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
  const projectsThisMonth = projects.filter((project) => isThisMonth(project.createdAt)).length
  const remindersThisMonth = autoRemindersThisMonth
  const hoursSavedThisMonth =
    completedThisMonth * 3 + Math.round((remindersThisMonth * 10) / 60)

  const urgentProjects = projects.filter((p) => {
    const reminderFreshness = p.lastReminderSentAt
      ? now - new Date(p.lastReminderSentAt).getTime()
      : Infinity
    const reminderSentRecently = reminderFreshness < 72 * 60 * 60 * 1000
    const ageMs = now - new Date(p.createdAt).getTime()
    return (
      p.status !== 'completed' &&
      ageMs > 48 * 60 * 60 * 1000 &&
      !reminderSentRecently
    )
  })

  const recentAutoReminder =
    [...projects]
      .filter((p) => p.lastReminderSentAt && p.lastReminderSource === 'auto')
      .sort(
        (a, b) =>
          new Date(b.lastReminderSentAt as string).getTime() -
          new Date(a.lastReminderSentAt as string).getTime(),
      )[0] ?? null

  const urgentNeedsAction = urgentProjects.length

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

  return (
    <DashboardLayout loading={loading} skeleton={<DashboardSkeleton />}>
      {canInstall ? (
        <div className="mb-4 flex items-center justify-between rounded-[var(--radius-sm)] border border-[rgba(91,110,245,0.2)] bg-[var(--accent-soft)] px-4 py-3">
          <p className="font-body text-sm text-[var(--accent)]">
            Installez Freli sur votre téléphone
          </p>
          <div className="flex items-center gap-2">
            <Button className="px-3 py-2 text-xs" onClick={() => promptInstall().then()}>
              Installer
            </Button>
            <button
              type="button"
              onClick={dismissBanner}
              className="h-8 w-8 rounded-full text-[var(--accent)] transition hover:bg-[var(--white)]"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
      {isStandalone ? (
        <div className="mb-4 inline-flex items-center rounded-full bg-[var(--mint-soft)] px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wide text-[var(--mint)]">
          Installée
        </div>
      ) : null}

      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
          Bonjour, {displayName} 👋
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="text-sm font-body text-[var(--ink-muted)]">{narrativeSubtitle}</p>
          {urgentNeedsAction > 0 ? (
            <button
              type="button"
              onClick={() => setFilter('pending')}
              className="text-sm font-body font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Voir les {urgentNeedsAction} projet{urgentNeedsAction > 1 ? 's' : ''}
            </button>
          ) : remindersThisMonth > 0 ? (
            <Link
              to="/dashboard/integrations"
              className="text-sm font-body font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Voir les relances
            </Link>
          ) : null}
        </div>
      </header>

      <div className="mt-6">
        <ActivityBanner
          draftReminderCount={draftReminderCount}
          urgentProjects={urgentProjects}
          recentAutoReminder={recentAutoReminder}
          remindersThisMonth={remindersThisMonth}
          now={now}
        />
      </div>

      <div className="mt-6">
        <StatusFilterBar filter={filter} onFilterChange={setFilter} projects={projects} />
      </div>

      {filteredProjects.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center justify-center py-14 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl"
            aria-hidden
          >
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
        <section className="mt-4 grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              now={now}
              pendingExtraction={pendingExtractionProjects.has(project.id)}
              menuOpen={menuOpenId === project.id}
              onMenuToggle={() =>
                setMenuOpenId(menuOpenId === project.id ? null : project.id)
              }
              onCopyLink={handleCopyLink}
              onDelete={() => {
                setMenuOpenId(null)
                setDeletingProject(project)
              }}
            />
          ))}
        </section>
      )}

      <KpiGrid
        activeProjects={activeProjects}
        pendingProjects={pendingProjects}
        averageCompletion={averageCompletion}
        totalProjects={projects.length}
        projectsThisMonth={projectsThisMonth}
        completedThisMonth={completedThisMonth}
        hoursSavedThisMonth={hoursSavedThisMonth}
        completedOnboardings={completedThisMonth}
        autoRemindersThisMonth={remindersThisMonth}
      />

      {deletingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/50 px-4">
          <Card className="w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-[var(--ink)]">Supprimer ce projet ?</h2>
            <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
              Le projet de <strong>{deletingProject.clientName}</strong> sera définitivement supprimé
              ainsi que tous ses documents et étapes.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button
                variant="secondary"
                onClick={() => setDeletingProject(null)}
                disabled={deleteLoading}
              >
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
