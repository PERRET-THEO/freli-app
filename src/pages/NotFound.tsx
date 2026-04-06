import { Link } from 'react-router-dom'
import { Button, Card } from '../components/ui'

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-xl text-center">
        <p className="font-display text-7xl font-extrabold tracking-tighter text-[var(--ink)]">
          404
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
          Cette page n&apos;existe pas
        </h1>
        <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
          Le lien demandé est introuvable ou a été déplacé.
        </p>
        <Link to="/" className="mt-6 inline-block">
          <Button>Retour à l&apos;accueil</Button>
        </Link>
      </Card>
    </div>
  )
}
