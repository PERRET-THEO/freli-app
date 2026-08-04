import { Button } from '../ui'
import { PortalPortfolioLink } from './PortalPortfolioLink'

type PortalWelcomeHeroProps = {
  clientName: string
  agencyName: string
  agencyTagline: string
  portalWelcomeMessage: string
  portfolioUrl: string | null
  portfolioLabel: string | null
  onStart: () => void
}

export function PortalWelcomeHero({
  clientName,
  agencyName,
  agencyTagline,
  portalWelcomeMessage,
  portfolioUrl,
  portfolioLabel,
  onStart,
}: PortalWelcomeHeroProps) {
  return (
    <div className="mb-8 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--white)] p-6 shadow-[0_2px_16px_rgba(13,15,20,0.06)] sm:p-8">
      <p className="text-4xl">👋</p>
      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
        Bonjour {clientName} !
      </h1>
      <p className="mt-2 font-body text-base text-[var(--ink-soft)]">
        Votre espace d&apos;onboarding avec <strong>{agencyName}</strong>
      </p>
      {agencyTagline ? (
        <p className="mt-1 font-body text-sm text-[var(--ink-muted)]">{agencyTagline}</p>
      ) : null}
      <p className="mt-2 font-body text-sm text-[var(--ink-muted)]">{portalWelcomeMessage}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button className="w-full sm:w-auto" onClick={onStart}>
          Commencer →
        </Button>
        <PortalPortfolioLink url={portfolioUrl} label={portfolioLabel} />
      </div>
    </div>
  )
}
