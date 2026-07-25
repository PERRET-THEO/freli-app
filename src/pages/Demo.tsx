import { Link } from 'react-router-dom'
import { SeoHead } from '../components/seo/SeoHead'
import { Button, Card } from '../components/ui'
import { siteConfig } from '../lib/seo/siteConfig'

const CALENDLY_EMBED_URL = `${siteConfig.calendlyUrl}?hide_gdpr_banner=1`

export function Demo() {
  return (
    <div className="min-h-screen bg-[var(--surface)] px-4 py-8 sm:px-6">
      <SeoHead path="/demo" />
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
            30 minutes pour voir Freli en action et poser vos questions : portail d&apos;onboarding
            unique, signature électronique, paiement Stripe et synchronisation Google Drive. Freli
            est accessible sur invitation — la démo est la première étape pour obtenir un accès.
          </p>
          <iframe
            src={CALENDLY_EMBED_URL}
            title="Réserver une démo Freli (Calendly)"
            loading="lazy"
            className="mt-6 h-[min(700px,75vh)] w-full max-w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)]"
          />
          <a
            href={siteConfig.calendlyUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block"
          >
            <Button>Ouvrir Calendly dans un nouvel onglet</Button>
          </a>
        </Card>
      </div>
    </div>
  )
}
