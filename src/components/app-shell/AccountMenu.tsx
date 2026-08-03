import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronUp, LogOut, Moon, Settings2, Sun } from 'lucide-react'
import { useAgencySession } from '../../contexts/AgencyContext'
import { supabase } from '../../lib/supabase'
import { useAppChrome } from './appChromeContext'
import { NavIcon } from './NavIcon'

export function AccountMenu() {
  const { email, agency } = useAgencySession()
  const { collapsed, navTheme, setNavTheme } = useAppChrome()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const agencyName = agency?.name?.trim() || 'Votre agence'
  const agencyLogoUrl = agency?.logo_url ?? null
  const initials = (agency?.name ?? email ?? 'FR').slice(0, 2).toUpperCase()

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleLogout = async () => {
    setOpen(false)
    await supabase.auth.signOut()
    navigate('/signin', { replace: true })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? agencyName : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--nav-border)] bg-[var(--nav-account-bg)] text-left outline-none transition hover:bg-[var(--nav-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-ring-offset)] ${
          collapsed ? 'justify-center p-2' : 'px-2.5 py-2'
        }`}
      >
        {agencyLogoUrl ? (
          <img src={agencyLogoUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--accent)] font-display text-[10px] font-bold text-[var(--white)]">
            {initials}
          </div>
        )}
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-body text-[13px] font-medium text-[var(--nav-fg-strong)]">
                {agencyName}
              </span>
              <span className="mt-0.5 block truncate font-body text-xs text-[var(--nav-fg-muted)]">
                {email ?? '—'}
              </span>
            </span>
            <ChevronUp
              size={16}
              strokeWidth={1.75}
              className={`shrink-0 text-[var(--nav-fg-muted)] transition ${open ? '' : 'rotate-180'}`}
              aria-hidden
            />
          </>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--nav-border)] bg-[var(--nav-menu-bg)] py-1 shadow-lg"
        >
          <div className="border-b border-[var(--nav-border)] px-3 py-2">
            <p className="truncate font-body text-sm font-medium text-[var(--nav-fg-strong)]">{agencyName}</p>
            <p className="truncate font-body text-xs text-[var(--nav-fg-muted)]">{email ?? '—'}</p>
          </div>
          <Link
            to="/dashboard/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 font-body text-sm text-[var(--nav-fg)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg-strong)]"
          >
            <NavIcon icon={Settings2} size="sm" />
            Paramètres
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setNavTheme(navTheme === 'dark' ? 'light' : 'dark')
            }}
            className="flex w-full items-center gap-2 px-3 py-2 font-body text-sm text-[var(--nav-fg)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg-strong)]"
          >
            <NavIcon icon={navTheme === 'dark' ? Sun : Moon} size="sm" />
            {navTheme === 'dark' ? 'Chrome clair' : 'Chrome sombre'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-2 px-3 py-2 font-body text-sm text-[var(--nav-fg)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg-strong)]"
          >
            <NavIcon icon={LogOut} size="sm" />
            Déconnexion
          </button>
        </div>
      ) : null}
    </div>
  )
}
