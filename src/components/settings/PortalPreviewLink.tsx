import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui'
import type { PortalPreviewData } from '../../lib/agencyBranding'
import { resolveLogoUrlForPreview, storePortalPreview } from '../../lib/agencyBranding'
import { agencyInitials, portalThemeStyle } from '../../lib/portalTheme'
import { DEFAULT_PORTAL_WELCOME, renderPortalWelcome } from '../../lib/portalWelcomeTemplate'
import { PortalPortfolioLink } from '../portal/PortalPortfolioLink'
import { PortalContactLinks } from '../portal/PortalContactLinks'

type PortalPreviewLinkProps = {
  data: PortalPreviewData
  projectNameExample?: string
}

type Viewport = 'mobile' | 'desktop'

export function PortalPreviewLink({
  data,
  projectNameExample = 'Site vitrine',
}: PortalPreviewLinkProps) {
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)
  const [viewport, setViewport] = useState<Viewport>('mobile')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void resolveLogoUrlForPreview(data.logoUrl).then((logoUrl) => {
        storePortalPreview({ ...data, logoUrl })
      })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [data])

  const openPreview = async () => {
    setOpening(true)
    try {
      const logoUrl = await resolveLogoUrlForPreview(data.logoUrl)
      storePortalPreview({ ...data, logoUrl })

      const popup = window.open('/portal-preview', '_blank')
      if (!popup) {
        navigate('/portal-preview')
      }
    } finally {
      setOpening(false)
    }
  }

  const themeStyle = portalThemeStyle(data.brandColor)
  const welcome = renderPortalWelcome(data.welcomeMessage || DEFAULT_PORTAL_WELCOME, {
    'client.prenom': 'Client',
    'client.entreprise': 'Entreprise exemple',
    'projet.nom': projectNameExample,
    'agence.nom': data.name || 'Mon agence',
  })

  const frameClass =
    viewport === 'mobile'
      ? 'mx-auto w-full max-w-[390px]'
      : 'w-full'

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-warm)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Aperçu rapide</p>
        <div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-0.5">
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`rounded px-2.5 py-1 text-[11px] font-body font-medium transition ${
              viewport === 'mobile'
                ? 'bg-[var(--ink)] text-[var(--white)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
            aria-pressed={viewport === 'mobile'}
          >
            Mobile
          </button>
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`rounded px-2.5 py-1 text-[11px] font-body font-medium transition ${
              viewport === 'desktop'
                ? 'bg-[var(--ink)] text-[var(--white)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
            aria-pressed={viewport === 'desktop'}
          >
            Desktop
          </button>
        </div>
      </div>

      <div className={`mt-3 ${frameClass}`} style={themeStyle as CSSProperties}>
        <div className="overflow-hidden rounded-[var(--radius-sm)] bg-[var(--white)] shadow-sm">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
            ) : (
              <div
                className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold"
                style={{
                  backgroundColor: 'var(--portal-accent)',
                  color: 'var(--portal-accent-fg)',
                }}
              >
                {agencyInitials(data.name)}
              </div>
            )}
            <span className="truncate text-xs font-display font-semibold text-[var(--ink)]">
              {data.name || 'Mon agence'}
            </span>
          </div>
          <div className="p-3">
            <p className="font-display text-sm font-bold text-[var(--ink)]">Bonjour Client !</p>
            {data.tagline ? (
              <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{data.tagline}</p>
            ) : null}
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-soft)]">{welcome}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div
                className="inline-block rounded-full px-3 py-1 text-[11px] font-medium"
                style={{
                  backgroundColor: 'var(--portal-accent)',
                  color: 'var(--portal-accent-fg)',
                }}
              >
                Commencer →
              </div>
              <PortalPortfolioLink
                url={data.portfolioUrl}
                label={data.portfolioLabel}
                className="!min-h-8 !px-3 !py-1 !text-[11px]"
              />
            </div>
          </div>
          {(data.contactEmail || data.contactPhone || data.helpText || data.helpTitle) && (
            <div className="border-t border-[var(--border)] px-3 py-2">
              {(data.helpTitle || data.helpText) && (
                <div className="mb-1 text-center">
                  {data.helpTitle ? (
                    <p className="text-[11px] font-body font-semibold text-[var(--ink)]">
                      {data.helpTitle}
                    </p>
                  ) : null}
                  {data.helpText ? (
                    <p className="text-[10px] font-body text-[var(--ink-muted)]">{data.helpText}</p>
                  ) : null}
                  {data.availability ? (
                    <p className="text-[10px] font-body text-[var(--ink-muted)]">{data.availability}</p>
                  ) : null}
                </div>
              )}
              <PortalContactLinks
                email={data.contactEmail}
                phone={data.contactPhone}
                projectName={projectNameExample}
                className="!gap-0 [&_a]:!min-h-9 [&_a]:!text-[10px]"
              />
            </div>
          )}
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="mt-3 w-full sm:w-auto"
        disabled={opening}
        onClick={() => void openPreview()}
      >
        {opening ? 'Préparation…' : 'Ouvrir l\u2019aperçu en plein écran'}
      </Button>
    </div>
  )
}
