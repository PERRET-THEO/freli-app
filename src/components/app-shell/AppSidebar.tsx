import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecentProjects, type RecentProject } from '../../lib/recentProjects'
import { useNavAttention } from '../../hooks/useNavAttention'
import { AccountMenu } from './AccountMenu'
import { useAppChrome } from './appChromeContext'
import { FOOTER_NAV, NAV_ICONS, NEW_PROJECT_NAV, PRIMARY_NAV } from './navConfig'
import { NavIcon } from './NavIcon'
import { NavItem } from './NavItem'

export function AppSidebar() {
  const { collapsed, toggleCollapsed, toggleCommand } = useAppChrome()
  const attention = useNavAttention()
  const [recents, setRecents] = useState<RecentProject[]>(() => getRecentProjects())

  useEffect(() => {
    const refresh = () => setRecents(getRecentProjects())
    window.addEventListener('focus', refresh)
    window.addEventListener('freli:recents-updated', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('freli:recents-updated', refresh)
    }
  }, [])

  const CollapseIcon = collapsed ? NAV_ICONS.panelExpand : NAV_ICONS.panelCollapse

  return (
    <aside
      className="nav-sidebar hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:flex-col md:border-r md:border-[var(--nav-border)] md:bg-[var(--nav-bg)] md:transition-[width] md:duration-200 md:ease-out"
      style={{ width: 'var(--sidebar-current-width)' }}
      aria-label="Navigation principale"
    >
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden ${
          collapsed ? 'px-2 py-4' : 'px-3 py-4'
        }`}
      >
        <div className={`flex shrink-0 items-center ${collapsed ? 'flex-col gap-2' : 'gap-2'}`}>
          <Link
            to="/dashboard"
            className={`flex min-w-0 items-center gap-2.5 rounded-[var(--radius-sm)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-ring-offset)] ${
              collapsed ? 'justify-center' : 'flex-1'
            }`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] font-display text-xs font-extrabold tracking-tight text-[var(--white)]">
              Fr
            </div>
            {!collapsed ? (
              <span className="truncate font-display text-lg font-extrabold tracking-tighter text-[var(--nav-fg-strong)]">
                Freli
              </span>
            ) : null}
          </Link>

          {!collapsed ? (
            <Link
              to={NEW_PROJECT_NAV.to}
              title={NEW_PROJECT_NAV.label}
              aria-label={NEW_PROJECT_NAV.label}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--white)] outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[var(--white)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-ring-offset)]"
            >
              <NavIcon icon={NEW_PROJECT_NAV.icon} active />
            </Link>
          ) : (
            <Link
              to={NEW_PROJECT_NAV.to}
              title={NEW_PROJECT_NAV.label}
              aria-label={NEW_PROJECT_NAV.label}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--white)] outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[var(--white)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-ring-offset)]"
            >
              <NavIcon icon={NEW_PROJECT_NAV.icon} active size="sm" />
            </Link>
          )}
        </div>

        {!collapsed ? (
          <button
            type="button"
            onClick={toggleCommand}
            className="mt-4 flex h-9 w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--nav-border)] bg-[var(--nav-account-bg)] px-2.5 text-left font-body text-sm text-[var(--nav-fg-muted)] outline-none transition hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-ring-offset)]"
          >
            <NavIcon icon={NAV_ICONS.search} size="sm" />
            <span className="flex-1 truncate">Rechercher…</span>
            <kbd className="rounded border border-[var(--nav-border)] px-1.5 py-0.5 font-body text-[10px] text-[var(--nav-fg-muted)]">
              ⌘K
            </kbd>
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleCommand}
            title="Rechercher (⌘K)"
            aria-label="Ouvrir la palette de commandes"
            className="mt-3 flex h-9 w-full items-center justify-center rounded-[var(--radius-sm)] text-[var(--nav-fg)] outline-none hover:bg-[var(--nav-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-ring-offset)]"
          >
            <NavIcon icon={NAV_ICONS.search} />
          </button>
        )}

        <nav className="mt-4 flex flex-col gap-0.5" aria-label="Destination">
          {PRIMARY_NAV.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              badge={item.badgeKey ? attention[item.badgeKey] : 0}
            />
          ))}
        </nav>

        {!collapsed && recents.length > 0 ? (
          <div className="mt-6">
            <p className="px-2.5 text-[10px] font-display font-bold uppercase tracking-[0.16em] text-[var(--nav-fg-muted)]">
              Récents
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {recents.map((project) => (
                <li key={project.id}>
                  <Link
                    to={`/dashboard/project/${project.id}`}
                    className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] px-2.5 font-body text-[13px] text-[var(--nav-fg)] outline-none transition hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-ring-offset)]"
                  >
                    <NavIcon icon={NAV_ICONS.history} size="sm" className="opacity-70" />
                    <span className="truncate">{project.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Développer la navigation ([)' : 'Réduire la navigation ([)'}
            aria-label={collapsed ? 'Développer la navigation' : 'Réduire la navigation'}
            className={`mb-2 flex h-8 w-full items-center rounded-[var(--radius-sm)] text-[var(--nav-fg-muted)] outline-none transition hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-ring-offset)] ${
              collapsed ? 'justify-center' : 'gap-2 px-2.5'
            }`}
          >
            <NavIcon icon={CollapseIcon} size="sm" />
            {!collapsed ? <span className="font-body text-xs">Réduire</span> : null}
          </button>
        </div>
      </div>

      <div
        className={`shrink-0 space-y-2 border-t border-[var(--nav-border)] ${
          collapsed ? 'px-2 py-3' : 'px-3 py-3'
        }`}
      >
        {FOOTER_NAV.map((item) => (
          <NavItem key={item.id} item={item} variant="footer" />
        ))}
        <AccountMenu />
      </div>
    </aside>
  )
}
