import { NavLink } from 'react-router-dom'
import { NavIcon } from './NavIcon'
import type { NavDestination, NavBadgeKey } from './navConfig'
import { useAppChrome } from './appChromeContext'

type NavItemProps = {
  item: NavDestination
  badge?: number
  variant?: 'primary' | 'footer'
}

function navItemClass(isActive: boolean, collapsed: boolean, variant: 'primary' | 'footer') {
  const base =
    'group relative flex h-9 w-full items-center gap-2.5 rounded-[var(--radius-sm)] text-left font-body text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-ring-offset)]'
  const pad = collapsed ? 'justify-center px-0' : 'px-2.5'
  const tone = isActive
    ? 'bg-[var(--nav-active-bg)] font-semibold text-[var(--nav-fg-strong)] shadow-[inset_3px_0_0_0_var(--accent)]'
    : variant === 'footer'
      ? 'font-medium text-[var(--nav-fg-muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg)]'
      : 'font-medium text-[var(--nav-fg)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg-strong)]'
  return `${base} ${pad} ${tone}`
}

export function NavItem({ item, badge = 0, variant = 'primary' }: NavItemProps) {
  const { collapsed } = useAppChrome()
  const showBadge = badge > 0

  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) => navItemClass(isActive, collapsed, variant)}
    >
      {({ isActive }) => (
        <>
          <NavIcon
            icon={item.icon}
            active={isActive}
            className={isActive ? 'text-[var(--accent)]' : 'text-current opacity-90'}
          />
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {showBadge ? (
                <span className="ml-auto rounded-md bg-[var(--nav-badge-bg)] px-1.5 py-0.5 font-body text-[10px] font-semibold tabular-nums text-[var(--nav-badge-fg)]">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </>
          ) : showBadge ? (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
          ) : null}
        </>
      )}
    </NavLink>
  )
}

export type { NavBadgeKey }
