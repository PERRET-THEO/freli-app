import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryStates } from 'nuqs'
import { ActivityBanner } from '../components/dashboard/ActivityBanner'
import { DashboardSkeleton } from '../components/dashboard/DashboardSkeleton'
import { FilterEmptyState } from '../components/dashboard/FilterEmptyState'
import { KpiGrid } from '../components/dashboard/KpiGrid'
import { ProjectCard } from '../components/dashboard/ProjectCard'
import { StatusFilterBar } from '../components/dashboard/StatusFilterBar'
import { useDashboardData } from '../components/dashboard/useDashboardData'
import type { ProjectCardData } from '../components/dashboard/types'
import { DashboardLayout } from '../components/DashboardLayout'
import { useAgencySession } from '../contexts/AgencyContext'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { dashboardSearchParams } from '../lib/dashboardSearchParams'
import {
  DASHBOARD_SORT_LABELS,
  matchesAttentionView,
  matchesSearchQuery,
  needsAgencyFollowUp,
  sortProjects,
  type AttentionView,
} from '../lib/projectAttention'
import { isBottleneckStale } from '../lib/projectBottleneck'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from '../components/ui'

const RESULTS_ID = 'dashboard-project-results'

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

  const [{ view, sort, q }, setSearchParams] = useQueryStates(dashboardSearchParams, {
    history: 'push',
  })

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [deletingProject, setDeletingProject] = useState<ProjectCardData | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const { canInstall, isStandalone, promptInstall, dismissBanner } = usePWAInstall()

  const setView = useCallback(
    (next: AttentionView) => {
      void setSearchParams({ view: next })
    },
    [setSearchParams],
  )

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

  const [now] = useState(() => Date.now())

  const filteredProjects = useMemo(() => {
    const byView = projects.filter((project) => matchesAttentionView(project, view, now))
    const bySearch = byView.filter((project) => matchesSearchQuery(project, q))
    return sortProjects(bySearch, sort)
  }, [projects, view, q, sort, now])

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

  const urgentProjects = projects.filter((p) => needsAgencyFollowUp(p, now))

  const staleBottleneckProjects = projects.filter(
    (p) =>
      p.status !== 'completed' &&
      p.blockingStepLabel &&
      p.blockingOwner &&
      p.blockingSince &&
      isBottleneckStale(
        {
          label: p.blockingStepLabel,
          owner: p.blockingOwner,
          since: p.blockingSince,
        },
        now,
      ),
  )

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

  const resultsLabel = `${filteredProjects.length} projet${filteredProjects.length !== 1 ? 's' : ''}`

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
              onClick={() => setView('action')}
              className="text-sm font-body font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Voir les {urgentNeedsAction} projet{urgentNeedsAction > 1 ? 's' : ''}
            </button>
          ) : remindersThisMonth > 0 ? (
            <Link
              to="/dashboard/settings#settings-relances"
              className="text-sm font-body font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Voir les relances
            </Link>
          ) : null}
        </div>
      </header>

      {staleBottleneckProjects.length > 0 ? (
        <button
          type="button"
          onClick={() => setView('blocked')}
          className="mt-4 w-full rounded-[var(--radius-sm)] border border-[var(--status-blocked-border)] bg-[var(--status-blocked-soft)] px-4 py-3 text-left transition hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        >
          <p className="font-body text-sm text-[var(--status-blocked)]">
            {staleBottleneckProjects.length} projet
            {staleBottleneckProjects.length > 1 ? 's bloqués' : ' bloqué'} depuis plus de 48 h
            {staleBottleneckProjects[0]?.blockingStepLabel
              ? ` — ex. « ${staleBottleneckProjects[0].blockingStepLabel} »`
              : ''}
            .
            <span className="ml-2 font-semibold underline-offset-2 hover:underline">
              Voir les bloqués
            </span>
          </p>
        </button>
      ) : null}

      <div className="mt-6">
        <ActivityBanner
          draftReminderCount={draftReminderCount}
          urgentProjects={urgentProjects}
          recentAutoReminder={recentAutoReminder}
          remindersThisMonth={remindersThisMonth}
          now={now}
        />
      </div>

      <div className="mt-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="shrink-0 font-display text-lg font-semibold text-[var(--ink)]">Projets</h2>
        <StatusFilterBar
          view={view}
          onViewChange={setView}
          projects={projects}
          now={now}
          resultsId={RESULTS_ID}
        />
      </div>

      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="dashboard-project-search">
          Rechercher un client ou un projet
        </label>
        <Input
          id="dashboard-project-search"
          value={q}
          onChange={(event) => {
            void setSearchParams({ q: event.target.value })
          }}
          placeholder="Rechercher un client…"
          className="sm:max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm font-body text-[var(--ink-muted)]">
          <span className="shrink-0">Tri</span>
          <select
            value={sort}
            onChange={(event) => {
              void setSearchParams({
                sort: event.target.value as 'newest' | 'stale_first',
              })
            }}
            className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 text-sm font-body text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {(Object.keys(DASHBOARD_SORT_LABELS) as Array<keyof typeof DASHBOARD_SORT_LABELS>).map(
              (key) => (
                <option key={key} value={key}>
                  {DASHBOARD_SORT_LABELS[key]}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {resultsLabel}
      </p>

      <div id={RESULTS_ID}>
        {filteredProjects.length === 0 ? (
          <FilterEmptyState
            view={view}
            hasAnyProjects={projects.length > 0}
            hasSearch={q.trim().length > 0}
            onViewChange={setView}
            onClearSearch={() => {
              void setSearchParams({ q: '' })
            }}
          />
        ) : (
          <section className="mt-4 grid min-w-0 gap-4 [&>*]:min-w-0 md:grid-cols-1 lg:grid-cols-2">
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
      </div>

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
