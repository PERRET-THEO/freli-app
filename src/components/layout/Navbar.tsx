import { Link } from 'react-router-dom'
import { appSignInUrl } from '../../lib/appUrl'
import { Button } from '../ui'

export function Navbar() {
  return (
    <header className="w-full border-b border-[var(--border)] bg-[var(--ink)]/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[var(--accent)] rounded-xl flex items-center justify-center font-display font-extrabold text-[var(--white)] text-sm tracking-tight">
            Fr
          </div>
          <span className="font-display font-extrabold text-2xl tracking-tighter text-[var(--white)]">
            Freli
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="font-body text-sm text-[var(--surface-warm)] hover:text-[var(--white)] transition-colors">
            Fonctionnalités
          </a>
          <a href="#how-it-works" className="font-body text-sm text-[var(--surface-warm)] hover:text-[var(--white)] transition-colors">
            Comment ça marche
          </a>
          <a
            href="https://calendly.com/freli/demo"
            target="_blank"
            rel="noreferrer"
            className="font-body text-sm text-[var(--surface-warm)] hover:text-[var(--white)] transition-colors"
          >
            Réserver une démo
          </a>
        </div>

        <a href={appSignInUrl()}>
          <Button variant="secondary" className="!text-sm">
            Connexion
          </Button>
        </a>
      </nav>
    </header>
  )
}
