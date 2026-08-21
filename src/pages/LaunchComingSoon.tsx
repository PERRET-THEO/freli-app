import { Reveal, RevealStagger, RevealStaggerItem } from '../components/landing/Reveal'
import { LaunchBenefitBento } from '../components/launch/LaunchBenefitBento'
import { LaunchProductFrame } from '../components/launch/LaunchProductFrame'
import { WaitlistForm } from '../components/launch/WaitlistForm'
import { SeoHead } from '../components/seo/SeoHead'
import { Card } from '../components/ui'
import { FRELI_SUBSCRIPTION } from '../lib/billing/entitlements'
import { faqPageJsonLd, jsonLdGraph, webPageJsonLd } from '../lib/seo/jsonLd'
import { routesMeta, siteConfig } from '../lib/seo/siteConfig'

const PRIVACY_URL = `${siteConfig.siteUrl}/confidentialite`
const LEGAL_URL = `${siteConfig.siteUrl}/mentions-legales`

const STEPS = [
  {
    step: '01',
    title: 'Vous vous inscrivez',
    text: 'Prénom, email, et un consentement explicite. Rien d’autre.',
  },
  {
    step: '02',
    title: 'Vous êtes prévenu·e en avant-première',
    text: 'Un seul email le jour de l’ouverture publique — pas de newsletter.',
  },
  {
    step: '03',
    title: 'Vous activez votre compte',
    text: 'Vous créez votre espace Freli et envoyez votre premier onboarding.',
  },
] as const

const FAQ = [
  {
    question: 'Quand Freli sera-t-il disponible ?',
    answer:
      'Le lancement public officiel arrive bientôt. En vous inscrivant, vous serez prévenu·e en avant-première dès l’ouverture.',
  },
  {
    question: 'Est-ce payant ?',
    answer: `Freli est un abonnement (${FRELI_SUBSCRIPTION.monthlyLabelHt} / mois ou ${FRELI_SUBSCRIPTION.yearlyLabelHt} / an). L’inscription à cette liste est gratuite et ne vous engage à rien.`,
  },
  {
    question: 'Que faites-vous de mon email ?',
    answer:
      'Uniquement vous prévenir du lancement public. Pas de newsletter, pas de cession à des tiers. Vous pouvez vous désinscrire à tout moment.',
  },
  {
    question: 'J’ai déjà un compte, dois-je m’inscrire ?',
    answer:
      'Non. Si vous avez déjà un compte Freli, vous n’avez pas besoin de cette liste. Cette page s’adresse aux personnes qui veulent être prévenues de l’ouverture publique.',
  },
  {
    question: 'Puis-je me désinscrire ?',
    answer:
      'Oui. Chaque email contient un lien de désinscription. Vos données ne sont conservées que pour cet usage, jusqu’au lancement ou jusqu’à votre désinscription.',
  },
] as const

function LogoMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] font-display text-sm font-extrabold tracking-tight text-[var(--white)]">
        Fr
      </div>
      <span
        className={`font-display text-2xl font-extrabold tracking-tighter ${inverted ? 'text-[var(--white)]' : 'text-[var(--ink)]'}`}
      >
        Freli
      </span>
    </div>
  )
}

function FormCard({
  idPrefix,
  title,
  subtitle,
}: {
  idPrefix: string
  title: string
  subtitle: string
}) {
  return (
    <Card className="relative overflow-hidden !bg-[var(--white)] shadow-[0_16px_48px_rgba(13,15,20,0.1),0_0_0_1px_rgba(13,15,20,0.04)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--accent)] via-[var(--accent-light)] to-[var(--accent)]"
        aria-hidden
      />
      <h2 className="font-display text-lg font-bold text-[var(--ink)]">{title}</h2>
      <p className="mt-1 mb-5 font-body text-sm text-[var(--ink-muted)]">{subtitle}</p>
      <WaitlistForm idPrefix={idPrefix} />
    </Card>
  )
}

export function LaunchComingSoon() {
  const meta = routesMeta['/lancement'] ?? routesMeta['/']

  return (
    <div className="min-h-dvh bg-[var(--surface)] text-[var(--ink)]">
      <SeoHead
        path="/lancement"
        jsonLd={jsonLdGraph(
          webPageJsonLd({
            path: '/lancement',
            name: meta.title,
            description: meta.description,
          }),
          faqPageJsonLd([...FAQ]),
        )}
      />

      <header className="sticky top-0 z-40 border-b border-[transparent] bg-[var(--surface)]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3.5 sm:px-6">
          <LogoMark />
        </div>
      </header>

      <main>
        {/* Hero — formulaire prioritaire sur mobile */}
        <section className="relative overflow-hidden px-4 pb-10 pt-8 sm:px-6 sm:pb-16 sm:pt-12">
          <div
            className="pointer-events-none absolute -left-32 top-8 h-48 w-48 rounded-full bg-[var(--accent-soft)] opacity-40 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-24 top-40 h-40 w-40 rounded-full bg-[var(--accent-soft)] opacity-30 blur-3xl"
            aria-hidden
          />

          <div className="relative mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            {/* Colonne copy + form (ordre mobile : badge → h1 → form → sub) */}
            <div className="order-1 flex w-full min-w-0 flex-col">
              <Reveal immediate>
                <p className="inline-flex w-fit items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-[var(--accent)]">
                  Lancement public bientôt
                </p>
                <h1 className="mt-3 font-display text-[1.85rem] font-extrabold leading-[1.15] tracking-tight text-[var(--ink)] sm:mt-4 sm:text-4xl lg:text-5xl">
                  Onboarder un client en 2&nbsp;minutes —{' '}
                  <span className="text-[var(--accent)]">Freli arrive.</span>
                </h1>
              </Reveal>

              {/* Formulaire dès que possible sur mobile */}
              <Reveal immediate delay={0.06} className="mt-5 sm:mt-6 lg:order-3">
                <FormCard
                  idPrefix="hero"
                  title="Réserver ma place"
                  subtitle="Accès prioritaire à l’ouverture. Un seul email, pas de spam."
                />
                <p className="mt-3 text-center font-body text-xs text-[var(--ink-muted)] sm:text-left">
                  Accès prioritaire · Pas de spam · Désinscription en 1 clic
                </p>
              </Reveal>

              <Reveal immediate delay={0.1} className="mt-4 lg:order-2 lg:mt-4">
                <p className="max-w-xl font-body text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base">
                  Pour freelances et agences : portail unique, signature, paiement Stripe et sync
                  Drive. Inscrivez-vous pour être prévenu·e dès l’ouverture — un seul email.
                </p>
              </Reveal>
            </div>

            {/* Mock produit : sous le fold sur mobile, à droite sur desktop */}
            <Reveal immediate delay={0.12} className="order-2 w-full min-w-0">
              <LaunchProductFrame className="relative w-full" />
            </Reveal>
          </div>
        </section>

        <LaunchBenefitBento />

        {/* Timeline + trust bandeau */}
        <section className="px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Après inscription
              </h2>
              <p className="mt-2 max-w-xl font-body text-sm text-[var(--ink-muted)]">
                Pas de compteur inventé, pas d’urgence artificielle — juste un email le jour J.
              </p>
            </Reveal>

            <RevealStagger className="relative mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
              {/* Ligne de connexion desktop */}
              <div
                className="pointer-events-none absolute left-[16.5%] right-[16.5%] top-5 hidden h-px bg-[var(--border)] sm:block"
                aria-hidden
              />
              {STEPS.map((item) => (
                <RevealStaggerItem key={item.step} className="relative">
                  <div className="flex items-start gap-4 sm:flex-col sm:items-center sm:text-center">
                    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-display text-sm font-bold text-[var(--white)] shadow-[0_4px_14px_rgba(91,110,245,0.35)]">
                      {item.step}
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-bold text-[var(--ink)]">
                        {item.title}
                      </h3>
                      <p className="mt-2 font-body text-sm leading-relaxed text-[var(--ink-muted)]">
                        {item.text}
                      </p>
                    </div>
                  </div>
                </RevealStaggerItem>
              ))}
            </RevealStagger>

            <Reveal className="mt-12">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-warm)] px-5 py-5 sm:px-8 sm:py-6">
                <p className="font-display text-base font-bold text-[var(--ink)] sm:text-lg">
                  Accès prioritaire, sans spam
                </p>
                <p className="mt-1.5 max-w-3xl font-body text-sm leading-relaxed text-[var(--ink-muted)]">
                  Vous recevez un unique email le jour de l’ouverture publique, puis vous créez
                  votre compte. Désinscription possible à tout moment.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-[var(--surface-warm)] px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl">
              <Reveal>
                <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Questions
                </h2>
              </Reveal>
              <div className="mt-8 space-y-3">
                {FAQ.map((entry) => (
                  <details
                    key={entry.question}
                    className="group rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] px-5 py-4 transition hover:border-[var(--accent)]/40"
                  >
                    <summary className="cursor-pointer list-none font-display text-base font-bold marker:content-none">
                      <span className="mr-2 inline-block text-[var(--accent)] transition-transform duration-200 group-open:rotate-90">
                        ›
                      </span>
                      {entry.question}
                    </summary>
                    <p className="mt-3 pl-5 font-body text-sm leading-relaxed text-[var(--ink-muted)]">
                      {entry.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Second CTA — fond ink */}
        <section className="bg-[var(--ink)] px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <p className="text-center font-display text-2xl font-extrabold tracking-tight text-[var(--white)] sm:text-3xl">
                Réservez votre place
              </p>
              <p className="mx-auto mt-2 max-w-md text-center font-body text-sm text-[var(--surface-warm)]">
                Même formulaire, pour celles et ceux qui ont d’abord lu la page.
              </p>
              <div className="mx-auto mt-8 max-w-3xl">
                <FormCard
                  idPrefix="footer"
                  title="Être prévenu·e du lancement"
                  subtitle="Un seul email à l’ouverture. Pas de newsletter."
                />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--ink-soft)] bg-[var(--ink)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <LogoMark inverted />
            <p className="font-body text-xs text-[var(--ink-muted)]">© 2026 Freli</p>
          </div>
          <div className="flex flex-wrap gap-5 font-body text-sm text-[var(--surface-warm)]">
            <a href={LEGAL_URL} className="hover:text-[var(--white)]">
              Mentions légales
            </a>
            <a href={PRIVACY_URL} className="hover:text-[var(--white)]">
              Politique de confidentialité
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
