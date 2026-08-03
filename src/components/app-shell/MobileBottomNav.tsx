import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Ellipsis } from 'lucide-react'
import {
  MOBILE_MORE_NAV,
  MOBILE_PRIMARY_NAV,
  NEW_PROJECT_NAV,
} from './navConfig'
import { NavIcon } from './NavIcon'

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
          open ? 'text-[var(--accent)]' : 'text-[var(--nav-fg-muted)]'
        }`}
        aria-label="Plus d'options"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <NavIcon icon={Ellipsis} size="sm" active={open} />
        <span className="max-w-full truncate text-[10px] font-display font-bold uppercase tracking-wide">
          Plus
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-50 mb-2 w-44 rounded-[var(--radius-md)] border border-[var(--nav-border)] bg-[var(--nav-menu-bg)] py-1 shadow-lg"
        >
          {MOBILE_MORE_NAV.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-body text-[var(--nav-fg-strong)] hover:bg-[var(--nav-hover)]"
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function MobileBottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--nav-border)] bg-[var(--nav-bg)] px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
      aria-label="Navigation mobile"
    >
      <div className="mx-auto flex max-w-lg items-end justify-between">
        {MOBILE_PRIMARY_NAV.slice(0, 2).map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-1.5 transition ${
                isActive ? 'text-[var(--accent)]' : 'text-[var(--nav-fg-muted)]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <NavIcon icon={item.icon} size="sm" active={isActive} />
                <span className="max-w-full truncate text-[10px] font-display font-bold uppercase tracking-wide">
                  {item.shortLabel ?? item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}

        <Link
          to={NEW_PROJECT_NAV.to}
          className="-mt-3 flex shrink-0 flex-col items-center px-1"
          aria-label={NEW_PROJECT_NAV.label}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--white)] shadow-[0_4px_16px_rgba(91,110,245,0.45)]">
            <NavIcon icon={NEW_PROJECT_NAV.icon} active />
          </span>
          <span className="mt-0.5 max-w-[4rem] truncate text-center text-[10px] font-display font-bold uppercase leading-tight tracking-wide text-[var(--accent)]">
            {NEW_PROJECT_NAV.shortLabel}
          </span>
        </Link>

        <NavLink
          to={MOBILE_PRIMARY_NAV[2].to}
          className={({ isActive }) =>
            `flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-1.5 transition ${
              isActive ? 'text-[var(--accent)]' : 'text-[var(--nav-fg-muted)]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <NavIcon icon={MOBILE_PRIMARY_NAV[2].icon} size="sm" active={isActive} />
              <span className="max-w-full truncate text-[10px] font-display font-bold uppercase tracking-wide">
                {MOBILE_PRIMARY_NAV[2].label}
              </span>
            </>
          )}
        </NavLink>

        <MobileMoreMenu />
      </div>
    </nav>
  )
}
