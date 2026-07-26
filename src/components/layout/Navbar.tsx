import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { appSignInUrl } from '../../lib/appUrl'
import { siteConfig } from '../../lib/seo/siteConfig'
import { Button } from '../ui'

const NAV_LINKS = [
  { href: '#features', label: 'Fonctionnalités', route: false },
  { href: '#integrations', label: 'Intégrations', route: false },
  { href: '#how-it-works', label: 'Comment ça marche', route: false },
  { href: '/tarifs', label: 'Tarifs', route: true },
  { href: siteConfig.calendlyUrl, label: 'Réserver une démo', route: false },
]

const linkClassName =
  'rounded-[var(--radius-sm)] px-3 py-3 font-body text-sm text-[var(--surface-warm)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--white)]'

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    if (!menuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--ink)]/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3" onClick={closeMenu}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] font-display text-sm font-extrabold tracking-tight text-[var(--white)]">
            Fr
          </div>
          <span className="font-display text-2xl font-extrabold tracking-tighter text-[var(--white)]">
            Freli
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) =>
            link.route ? (
              <Link
                key={link.href}
                to={link.href}
                className="font-body text-sm text-[var(--surface-warm)] transition-colors hover:text-[var(--white)]"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className="font-body text-sm text-[var(--surface-warm)] transition-colors hover:text-[var(--white)]"
              >
                {link.label}
              </a>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <a href={appSignInUrl()} className="hidden sm:block">
            <Button variant="secondary" className="!text-sm">
              Connexion
            </Button>
          </a>
          <button
            type="button"
            className="relative z-[60] flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--white)] md:hidden"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="text-2xl leading-none">{menuOpen ? '×' : '☰'}</span>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            className="fixed inset-0 z-40 bg-black/50"
            onClick={closeMenu}
          />
          <div
            id="mobile-nav-menu"
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-0 top-[73px] z-50 max-h-[calc(100dvh-73px)] overflow-y-auto border-t border-[rgba(255,255,255,0.08)] bg-[var(--ink)] px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-1">
              {NAV_LINKS.map((link) =>
                link.route ? (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={closeMenu}
                    className={linkClassName}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className={linkClassName}
                  >
                    {link.label}
                  </a>
                ),
              )}
              <a href={appSignInUrl()} onClick={closeMenu} className="mt-2 sm:hidden">
                <Button variant="secondary" className="w-full !text-sm">
                  Connexion
                </Button>
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
