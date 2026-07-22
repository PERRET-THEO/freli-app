import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAgencySession } from '../contexts/AgencyContext'
import { dashboardNavIcons, sidebarItemClass } from './dashboard/navIcons'

const icons = dashboardNavIcons

type DashboardLayoutProps = {
  children: ReactNode
  title?: string
  subtitle?: string
  maxWidth?: '4xl' | '5xl' | '7xl'
  loading?: boolean
  skeleton?: ReactNode
}

const maxWidthClass: Record<NonNullable<DashboardLayoutProps['maxWidth']>, string> = {
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '7xl': 'max-w-7xl',
}

function MobileMoreMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-1.5 transition ${
          open ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.45)]'
        }`}
        aria-label="Plus d'options"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-6 w-6 items-center justify-center text-lg leading-none">⋯</span>
        <span className="max-w-full truncate text-[10px] font-display font-bold uppercase tracking-wide">
          Plus
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-50 mb-2 w-44 rounded-[var(--radius-md)] border border-[rgba(255,255,255,0.1)] bg-[var(--ink-soft)] py-1 shadow-lg"
        >
          <NavLink
            to="/dashboard/integrations"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-body text-[var(--white)] hover:bg-[rgba(255,255,255,0.06)]"
          >
            Intégrations
          </NavLink>
          <NavLink
            to="/dashboard/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-body text-[var(--white)] hover:bg-[rgba(255,255,255,0.06)]"
          >
            Réglages
          </NavLink>
        </div>
      ) : null}
    </div>
  )
}

export function DashboardLayout({
  children,
  title,
  subtitle,
  maxWidth = '7xl',
  loading = false,
  skeleton,
}: DashboardLayoutProps) {
  const { loading: sessionLoading, email, agency } = useAgencySession()
  const agencyName = agency?.name ?? null
  const agencyLogoUrl = agency?.logo_url ?? null
  const contentMax = maxWidthClass[maxWidth]
  const showSkeleton = (sessionLoading || loading) && skeleton

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-72 md:flex-col md:border-r md:border-[rgba(255,255,255,0.06)] md:bg-[var(--ink)] md:p-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <Link
            to="/dashboard"
            className="flex shrink-0 items-center gap-3 rounded-[var(--radius-sm)] outline-none ring-offset-2 ring-offset-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] font-display text-sm font-extrabold tracking-tight text-[var(--white)] shadow-[0_4px_12px_rgba(91,110,245,0.35)]">
              Fr
            </div>
            <div>
              <span className="font-display text-xl font-extrabold tracking-tighter text-[var(--white)]">Freli</span>
            </div>
          </Link>

          <Link
            to="/dashboard/new"
            className="mt-6 flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2.5 font-display text-sm font-bold text-[var(--white)] shadow-[0_6px_20px_rgba(91,110,245,0.35)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--white)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
          >
            <span className="h-4 w-4 [&>svg]:h-full [&>svg]:w-full">{icons.plus}</span>
            Nouveau projet
          </Link>

          <p className="mt-8 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-[rgba(253,252,250,0.35)]">
            Activité
          </p>
          <nav className="mt-2 flex flex-col gap-1">
            <NavLink to="/dashboard" end className={({ isActive }) => sidebarItemClass(isActive)}>
              <span className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)] opacity-90 [&>svg]:h-full [&>svg]:w-full">
                {icons.overview}
              </span>
              <span className="min-w-0">
                <span className="block font-body text-sm font-semibold">Vue d&apos;ensemble</span>
                <span className="mt-0.5 block font-body text-[11px] leading-snug text-[rgba(253,252,250,0.42)] group-hover:text-[rgba(253,252,250,0.55)]">
                  Projets, progression
                </span>
              </span>
            </NavLink>
            <NavLink to="/dashboard/clients" className={({ isActive }) => sidebarItemClass(isActive)}>
              <span className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)] opacity-90 [&>svg]:h-full [&>svg]:w-full">
                {icons.users}
              </span>
              <span className="min-w-0">
                <span className="block font-body text-sm font-semibold">Clients</span>
                <span className="mt-0.5 block font-body text-[11px] leading-snug text-[rgba(253,252,250,0.42)] group-hover:text-[rgba(253,252,250,0.55)]">
                  Annuaire & fiches
                </span>
              </span>
            </NavLink>
          </nav>

          <p className="mt-6 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-[rgba(253,252,250,0.35)]">
            Documents &amp; automatisation
          </p>
          <nav className="mt-2 flex flex-col gap-1">
            <NavLink to="/dashboard/templates" className={({ isActive }) => sidebarItemClass(isActive)}>
              <span className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)] opacity-90 [&>svg]:h-full [&>svg]:w-full">
                {icons.file}
              </span>
              <span className="min-w-0">
                <span className="block font-body text-sm font-semibold">Contrats</span>
                <span className="mt-0.5 block font-body text-[11px] leading-snug text-[rgba(253,252,250,0.42)] group-hover:text-[rgba(253,252,250,0.55)]">
                  Modèles &amp; signature
                </span>
              </span>
            </NavLink>
            <NavLink to="/dashboard/integrations" className={({ isActive }) => sidebarItemClass(isActive)}>
              <span className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)] opacity-90 [&>svg]:h-full [&>svg]:w-full">
                {icons.link}
              </span>
              <span className="min-w-0">
                <span className="block font-body text-sm font-semibold">Intégrations</span>
                <span className="mt-0.5 block font-body text-[11px] leading-snug text-[rgba(253,252,250,0.42)] group-hover:text-[rgba(253,252,250,0.55)]">
                  Stripe, relances, outils
                </span>
              </span>
            </NavLink>
          </nav>
        </div>

        <div className="shrink-0 space-y-3 border-t border-[rgba(255,255,255,0.08)] pt-4">
          <NavLink to="/dashboard/settings" className={({ isActive }) => sidebarItemClass(isActive)}>
            <span className="mt-0.5 h-5 w-5 shrink-0 text-[rgba(253,252,250,0.55)] [&>svg]:h-full [&>svg]:w-full">
              {icons.settings}
            </span>
            <span className="min-w-0">
              <span className="block font-body text-sm font-semibold">Paramètres</span>
              <span className="mt-0.5 block font-body text-[11px] text-[rgba(253,252,250,0.38)]">Agence &amp; compte</span>
            </span>
          </NavLink>
          <div className="rounded-[var(--radius-sm)] border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.2)] px-3 py-2.5">
            <p className="text-[10px] font-display font-bold uppercase tracking-wide text-[rgba(253,252,250,0.4)]">
              {agencyName ?? 'Votre compte'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {agencyLogoUrl ? (
                <img src={agencyLogoUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--accent)] font-display text-[10px] font-bold text-white">
                  {(agencyName ?? email ?? 'FR').slice(0, 2).toUpperCase()}
                </div>
              )}
              <p className="min-w-0 break-all font-body text-xs leading-snug text-[var(--white)]">
                {email ?? '—'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className={`mx-auto md:ml-72 ${contentMax}`}>
        <main className="w-full px-4 py-8 pb-24 sm:px-8 md:pb-8">
          {title ? (
            <header className="mb-6">
              <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">{title}</h1>
              {subtitle ? (
                <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">{subtitle}</p>
              ) : null}
            </header>
          ) : null}
          {showSkeleton ? skeleton : sessionLoading ? (
            <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
          ) : (
            children
          )}
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[rgba(255,255,255,0.08)] bg-[var(--ink)] px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
        <div className="mx-auto flex max-w-lg items-end justify-between">
          <NavLink
            to="/dashboard"
            end
            className={({ isActive }) =>
              `flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-1.5 transition ${
                isActive ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.45)]'
              }`
            }
          >
            <span className="flex h-6 w-6 items-center justify-center [&>svg]:h-full [&>svg]:w-full">{icons.overview}</span>
            <span className="max-w-full truncate text-[10px] font-display font-bold uppercase tracking-wide">
              Accueil
            </span>
          </NavLink>
          <NavLink
            to="/dashboard/clients"
            className={({ isActive }) =>
              `flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-1.5 transition ${
                isActive ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.45)]'
              }`
            }
          >
            <span className="flex h-6 w-6 items-center justify-center [&>svg]:h-full [&>svg]:w-full">{icons.users}</span>
            <span className="max-w-full truncate text-[10px] font-display font-bold uppercase tracking-wide">
              Clients
            </span>
          </NavLink>
          <Link
            to="/dashboard/new"
            className="-mt-3 flex shrink-0 flex-col items-center px-1"
            aria-label="Nouveau projet"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--white)] shadow-[0_4px_16px_rgba(91,110,245,0.45)] [&>svg]:h-5 [&>svg]:w-5">
              {icons.plus}
            </span>
            <span className="mt-0.5 max-w-[4rem] truncate text-center text-[10px] font-display font-bold uppercase leading-tight tracking-wide text-[var(--accent)]">
              Nouveau
            </span>
          </Link>
          <NavLink
            to="/dashboard/templates"
            className={({ isActive }) =>
              `flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-1.5 transition ${
                isActive ? 'text-[var(--accent)]' : 'text-[rgba(255,255,255,0.45)]'
              }`
            }
          >
            <span className="flex h-6 w-6 items-center justify-center [&>svg]:h-full [&>svg]:w-full">{icons.file}</span>
            <span className="max-w-full truncate text-[10px] font-display font-bold uppercase tracking-wide">
              Contrats
            </span>
          </NavLink>
          <MobileMoreMenu />
        </div>
      </nav>
    </div>
  )
}
