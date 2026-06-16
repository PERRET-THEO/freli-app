import { useState } from 'react'
import { Link } from 'react-router-dom'
import { appSignInUrl } from '../../lib/appUrl'
import { Button } from '../ui'

const NAV_LINKS = [
  { href: '#features', label: 'Fonctionnalités', external: false },
  { href: '#how-it-works', label: 'Comment ça marche', external: false },
  { href: 'https://calendly.com/freli/demo', label: 'Réserver une démo', external: true },
]

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="w-full border-b border-[var(--border)] bg-[var(--ink)]/95 backdrop-blur">
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
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="font-body text-sm text-[var(--surface-warm)] transition-colors hover:text-[var(--white)]"
              >
                {link.label}
              </a>
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
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--white)] md:hidden"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="text-2xl leading-none">{menuOpen ? '×' : '☰'}</span>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="border-t border-[rgba(255,255,255,0.08)] bg-[var(--ink)] px-4 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={closeMenu}
                  className="rounded-[var(--radius-sm)] px-3 py-3 font-body text-sm text-[var(--surface-warm)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--white)]"
                >
                  {link.label}
                </a>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className="rounded-[var(--radius-sm)] px-3 py-3 font-body text-sm text-[var(--surface-warm)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--white)]"
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
      ) : null}
    </header>
  )
}
