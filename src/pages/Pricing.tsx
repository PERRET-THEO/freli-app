import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { SeoHead } from '../components/seo/SeoHead'
import { Button } from '../components/ui'

const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    audience: 'Freelances & indépendants',
    priceLabel: 'Sur devis',
    priceHint: 'Présenté en démo — tarif adapté à un usage individuel',
    features: [
      'Portail client white-label illimité',
      'Signature électronique + preuves',
      'Paiement Stripe Connect',
      'Relances automatiques',
      '1 siège (vous)',
      'Webhooks & sync Google Drive',
    ],
  },
  {
    id: 'agence',
    name: 'Agence',
    audience: 'Petites agences & studios',
    priceLabel: 'Sur devis',
    priceHint: 'Sièges collaborateurs inclus — détails en démo',
    featured: true,
    features: [
      'Tout Solo, plus :',
      'Sièges équipe (owner / members)',
      'Templates & process partagés',
      'Revue approve / reject à plusieurs',
      'Visibilité des étapes bloquantes',
      'Accompagnement à la mise en route',
    ],
  },
] as const

export function Pricing() {
  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--white)]">
      <SeoHead
        path="/tarifs"
        title="Tarifs Freli — Solo et Agence"
        description="Découvrez les offres Freli Solo et Agence pour automatiser l’onboarding client. Accès sur invitation — conditions présentées lors de la démo."
      />
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center text-sm font-body text-[var(--surface-warm)] hover:text-[var(--white)]"
        >
          ← Retour à l&apos;accueil
        </Link>

        <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight">
          Tarifs Freli
        </h1>
        <p className="mt-4 max-w-2xl text-sm font-body leading-relaxed text-[var(--surface-warm)]">
          Deux offres simples. Freli est accessible sur invitation : les conditions tarifaires
          exactes sont confirmées lors de la démo, selon votre volume d&apos;onboardings.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`rounded-[var(--radius-lg)] border p-6 ${
                'featured' in plan && plan.featured
                  ? 'border-[var(--accent)] bg-[rgba(91,110,245,0.12)]'
                  : 'border-[var(--ink-soft)] bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--accent)]">
                {plan.audience}
              </p>
              <h2 className="mt-2 font-display text-3xl font-extrabold">{plan.name}</h2>
              <p className="mt-4 font-display text-2xl font-bold">{plan.priceLabel}</p>
              <p className="mt-1 text-xs font-body text-[var(--surface-warm)]">{plan.priceHint}</p>
              <ul className="mt-6 space-y-2 text-sm font-body text-[var(--surface-warm)]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-[var(--mint)]" aria-hidden>
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link to="/demo" className="mt-8 inline-block">
                <Button className="w-full sm:w-auto">Réserver une démo</Button>
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-10 text-sm font-body text-[var(--surface-warm)]">
          Vous comparez Freli à un autre outil ? Voir les{' '}
          <Link to="/comparatifs" className="text-[var(--accent)] underline-offset-2 hover:underline">
            comparatifs
          </Link>
          .
        </p>
      </main>
    </div>
  )
}
