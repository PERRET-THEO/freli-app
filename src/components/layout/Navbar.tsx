import { Link } from 'react-router-dom'
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
          <a href="#features" className="font-body text-sm text-[var(--surface-warm)]">
            Fonctionnalités
          </a>
          <a href="#features" className="font-body text-sm text-[var(--surface-warm)]">
            Fonctionnalités
          </a>
          <a
            href="https://calendly.com/freli/demo"
            target="_blank"
            rel="noreferrer"
            className="font-body text-sm text-[var(--surface-warm)]"
          >
            Réserver une démo
          </a>
          <Link to="/auth" className="font-body text-sm text-[var(--surface-warm)]">
            Connexion
          </Link>
        </div>

        <Link to="/auth">
          <Button variant="secondary" className="!text-sm">
            Essai gratuit →
          </Button>
        </Link>
      </nav>
    </header>
  )
}
