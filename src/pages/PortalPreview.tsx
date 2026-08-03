import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui'
import { PortalContactLinks } from '../components/portal/PortalContactLinks'
import { PortalPortfolioLink } from '../components/portal/PortalPortfolioLink'
import { DEFAULT_BRAND_COLOR, normalizeBrandColor, readPortalPreview } from '../lib/agencyBranding'
import { agencyInitials, portalThemeStyle } from '../lib/portalTheme'
import {
  DEFAULT_PORTAL_HELP_TITLE,
  DEFAULT_PORTAL_WELCOME,
  renderPortalWelcome,
} from '../lib/portalWelcomeTemplate'

type Viewport = 'mobile' | 'desktop'

export function PortalPreview() {
  const data = useMemo(() => readPortalPreview(), [])
  const [viewport, setViewport] = useState<Viewport>('desktop')

  const brandColor = normalizeBrandColor(data?.brandColor ?? DEFAULT_BRAND_COLOR)
  const agencyName = data?.name?.trim() || 'Mon agence'
  const themeStyle = portalThemeStyle(brandColor)
  const welcomeMessage = renderPortalWelcome(
    data?.welcomeMessage?.trim() || DEFAULT_PORTAL_WELCOME,
    {
      'client.prenom': 'Client',
      'client.entreprise': 'Entreprise exemple',
      'projet.nom': 'Site vitrine',
      'agence.nom': agencyName,
    },
  )

  const helpTitle = data?.helpTitle?.trim() || DEFAULT_PORTAL_HELP_TITLE
  const helpText = data?.helpText?.trim() || ''
  const availability = data?.availability?.trim() || ''
  const hasHelp =
    Boolean(data?.contactEmail?.trim()) ||
    Boolean(data?.contactPhone?.trim()) ||
    Boolean(helpText) ||
    Boolean(availability)

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <div className="max-w-md rounded-[var(--radius-lg)] bg-[var(--white)] p-8 text-center shadow-lg">
          <p className="font-display text-lg font-bold text-[var(--ink)]">Aperçu indisponible</p>
          <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
            Ouvrez l&apos;aperçu depuis Paramètres → Portail client.
          </p>
          <Link to="/dashboard/settings" className="mt-4 inline-block">
            <Button variant="secondary">Retour aux paramètres</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--surface)]" style={themeStyle as CSSProperties}>
      <div className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--white)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <p className="font-body text-xs text-[var(--ink-muted)]">Mode aperçu</p>
          <div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] p-0.5">
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`rounded px-2.5 py-1 text-[11px] font-body font-medium ${
                viewport === 'mobile' ? 'bg-[var(--ink)] text-white' : 'text-[var(--ink-muted)]'
              }`}
            >
              Mobile
            </button>
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`rounded px-2.5 py-1 text-[11px] font-body font-medium ${
                viewport === 'desktop' ? 'bg-[var(--ink)] text-white' : 'text-[var(--ink-muted)]'
              }`}
            >
              Desktop
            </button>
          </div>
          <Link to="/dashboard/settings#settings-portail" className="font-body text-xs text-[var(--accent)] underline">
            Retour
          </Link>
        </div>
      </div>

      <div
        className={`mx-auto transition-[max-width] duration-300 motion-reduce:transition-none ${
          viewport === 'mobile' ? 'max-w-[390px]' : 'max-w-2xl'
        }`}
      >
        <header className="sticky top-10 z-40 border-b border-[var(--border)] bg-[var(--white)]/95 backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              {data.logoUrl ? (
                <img src={data.logoUrl} alt="" className="h-8 w-auto rounded-[var(--radius-xs)] object-contain" />
              ) : (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg font-display text-xs font-extrabold"
                  style={{
                    backgroundColor: 'var(--portal-accent)',
                    color: 'var(--portal-accent-fg)',
                  }}
                >
                  {agencyInitials(agencyName)}
                </div>
              )}
              <span className="hidden font-display text-sm font-bold text-[var(--ink)] sm:block">
                Client exemple
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-body text-xs font-medium text-[var(--ink-muted)]">33%</span>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--surface-warm)] sm:w-32">
                <div
                  className="h-full rounded-full transition-all motion-reduce:transition-none"
                  style={{ width: '33%', backgroundColor: 'var(--portal-accent)' }}
                />
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 pb-16 pt-6 sm:px-6">
          <div className="mb-4 rounded-[var(--radius-sm)] bg-[var(--portal-accent-soft)] px-3 py-2 text-center text-xs font-body text-[var(--portal-accent)]">
            Mode aperçu — ce que vos clients verront
          </div>

          <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--white)] p-6 shadow-[0_2px_16px_rgba(13,15,20,0.06)] sm:p-8">
            <p className="text-4xl">👋</p>
            <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
              Bonjour Client exemple !
            </h1>
            <p className="mt-2 font-body text-base text-[var(--ink-soft)]">
              Votre espace d&apos;onboarding avec <strong>{agencyName}</strong>
            </p>
            {data.tagline ? (
              <p className="mt-1 font-body text-sm text-[var(--ink-muted)]">{data.tagline}</p>
            ) : null}
            <p className="mt-2 font-body text-sm text-[var(--ink-muted)]">{welcomeMessage}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-[var(--radius-sm)] px-6 py-3 text-sm font-body font-medium shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--portal-accent)]"
                style={{
                  backgroundColor: 'var(--portal-accent)',
                  color: 'var(--portal-accent-fg)',
                }}
              >
                Commencer →
              </button>
              <PortalPortfolioLink url={data.portfolioUrl} label={data.portfolioLabel} />
            </div>
          </div>

          {hasHelp ? (
            <footer className="mt-8 border-t border-[var(--border)] pt-6 text-center">
              <p className="font-display text-sm font-semibold text-[var(--ink)]">{helpTitle}</p>
              {helpText ? (
                <p className="mt-1 font-body text-xs text-[var(--ink-muted)]">{helpText}</p>
              ) : null}
              {availability ? (
                <p className="mt-1 font-body text-xs text-[var(--ink-muted)]">{availability}</p>
              ) : null}
              <PortalContactLinks
                email={data.contactEmail}
                phone={data.contactPhone}
                projectName="Site vitrine"
                className="mt-2"
              />
            </footer>
          ) : null}

          <p className="mt-8 pb-8 text-center font-body text-xs text-[var(--ink-muted)]">
            Propulsé par <span className="font-display font-bold text-[var(--ink)]">Freli</span>
          </p>
        </main>
      </div>
    </div>
  )
}
