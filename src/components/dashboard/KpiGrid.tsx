import { useState } from 'react'
import { Card } from '../ui'

type KpiGridProps = {
  activeProjects: number
  pendingProjects: number
  averageCompletion: number
  totalProjects: number
  projectsThisMonth: number
  completedThisMonth: number
  hoursSavedThisMonth: number
  completedOnboardings: number
  autoRemindersThisMonth: number
}

export function KpiGrid({
  activeProjects,
  pendingProjects,
  averageCompletion,
  totalProjects,
  projectsThisMonth,
  completedThisMonth,
  hoursSavedThisMonth,
  completedOnboardings,
  autoRemindersThisMonth,
}: KpiGridProps) {
  const [showTimeBreakdown, setShowTimeBreakdown] = useState(false)
  const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long' })

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-semibold text-[var(--ink)]">Ce mois</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--ink-muted)]">
              Projets actifs
            </p>
            {activeProjects > 0 && (
              <span className="relative flex h-2 w-2" aria-hidden>
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
              <span className="font-display text-[10px] font-bold text-[var(--mint)]" aria-hidden>
                ↑
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] font-body text-[var(--ink-muted)]">
            moyenne sur {totalProjects} projet{totalProjects > 1 ? 's' : ''}
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-warm)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${averageCompletion}%` }}
            />
          </div>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            Projets ce mois
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold text-[var(--ink)]">
            {projectsThisMonth}
          </p>
          <p className="mt-1 text-[11px] font-body text-[var(--ink-muted)]" title={`Projets démarrés en ${monthLabel}`}>
            {completedThisMonth} terminé{completedThisMonth > 1 ? 's' : ''} · démarrés en {monthLabel}
          </p>
        </Card>

        <Card className="relative overflow-hidden border border-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent-soft)] to-[var(--white)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--accent)]">
              Temps gagné
            </p>
            <button
              type="button"
              onClick={() => setShowTimeBreakdown((v) => !v)}
              className="text-[10px] font-body font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
              aria-expanded={showTimeBreakdown}
            >
              Comment ?
            </button>
          </div>
          {hoursSavedThisMonth > 0 ? (
            <>
              <p className="mt-2 font-display text-3xl font-extrabold text-[var(--ink)]">
                {hoursSavedThisMonth}
                <span className="text-lg">h</span>
              </p>
              <p className="mt-1 text-[11px] font-body text-[var(--ink-muted)]">
                ce mois, grâce à l&apos;automatisation
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 font-display text-lg font-bold text-[var(--ink)]">
                Pas encore ce mois
              </p>
              <p className="mt-1 text-[11px] font-body text-[var(--ink-muted)]">
                Les relances auto et onboardings complétés s&apos;additionnent ici.
              </p>
            </>
          )}
          {showTimeBreakdown ? (
            <p className="mt-2 text-[11px] font-body text-[var(--ink-muted)]">
              {completedOnboardings} onboarding × 3h + {autoRemindersThisMonth} relance
              {autoRemindersThisMonth > 1 ? 's' : ''} auto × 10 min
            </p>
          ) : null}
        </Card>
      </div>
    </section>
  )
}
