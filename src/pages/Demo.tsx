import { Link } from 'react-router-dom'
import { Button, Card } from '../components/ui'

export function Demo() {
  return (
    <div className="min-h-screen bg-[var(--surface)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/"
          className="inline-flex items-center text-sm font-body text-[var(--ink-muted)] hover:text-[var(--accent)]"
        >
          ← Retour à l&apos;accueil
        </Link>

        <Card className="mt-4">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-[var(--ink)]">
            Réservez votre démo Freli
          </h1>
          <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
            30 minutes pour voir Freli en action et poser vos questions.
          </p>
          <div
            className="mt-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 text-sm font-body text-[var(--ink-soft)]"
            style={{ minWidth: 320, height: 630 }}
            data-url="https://calendly.com/freli/demo"
          >
            Chargement du calendrier...
          </div>
          <a
            href="https://calendly.com/freli/demo"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block"
          >
            <Button>Ouvrir Calendly</Button>
          </a>
        </Card>
      </div>
    </div>
  )
}
