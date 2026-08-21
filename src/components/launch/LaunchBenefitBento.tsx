import { Building2, FileSignature, Link2, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FeatureVisual, type FeatureVisualId } from '../landing/FeatureVisuals'
import { Reveal, RevealStagger, RevealStaggerItem } from '../landing/Reveal'
import { Card } from '../ui'

const BENEFITS: {
  title: string
  text: string
  icon: LucideIcon
  visual: FeatureVisualId
}[] = [
  {
    title: 'Un seul lien pour tout l’onboarding',
    text: 'Formulaire, documents et signature au même endroit — plus de chaînes d’emails.',
    icon: Link2,
    visual: 'portal-checklist',
  },
  {
    title: 'Signature sans va-et-vient',
    text: 'Vos clients signent depuis le téléphone — fini DocuSign à payer.',
    icon: FileSignature,
    visual: 'signature-pad',
  },
  {
    title: 'Encaisser sans outil séparé',
    text: 'Stripe Connect envoie le lien de paiement et suit jusqu’au « payé ».',
    icon: Wallet,
    visual: 'payment-step',
  },
  {
    title: 'SIREN + Drive, sans copier-coller',
    text: 'Autofill officiel data.gouv, puis sync des dossiers clients dans Drive.',
    icon: Building2,
    visual: 'company-autofill',
  },
]

export function LaunchBenefitBento() {
  return (
    <section className="bg-[var(--surface-warm)] px-4 py-14 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Pourquoi Freli
          </h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base">
            Un seul outil à la place des emails, formulaires, signatures et relances manuelles.
          </p>
        </Reveal>

        <RevealStagger className="mt-8 grid gap-4 lg:grid-cols-2">
          {BENEFITS.map((card) => (
            <RevealStaggerItem key={card.title} className="min-w-0">
              <Card className="h-full overflow-hidden !p-0 transition duration-200 hover:-translate-y-0.5">
                <div className="grid h-full md:grid-cols-[1fr_1fr]">
                  <div className="flex flex-col justify-center p-5 sm:p-6">
                    <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent)]">
                      <card.icon className="h-4 w-4" aria-hidden />
                    </div>
                    <h3 className="font-display text-base font-bold text-[var(--ink)] sm:text-lg">
                      {card.title}
                    </h3>
                    <p className="mt-2 font-body text-sm leading-relaxed text-[var(--ink-muted)]">
                      {card.text}
                    </p>
                  </div>
                  <div className="min-h-[12rem] overflow-hidden [&>div]:h-full [&>div]:min-h-[12rem] [&>div]:rounded-none">
                    <FeatureVisual id={card.visual} />
                  </div>
                </div>
              </Card>
            </RevealStaggerItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  )
}
