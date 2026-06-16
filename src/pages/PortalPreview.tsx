import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui'
import { DEFAULT_BRAND_COLOR, normalizeBrandColor, readPortalPreview } from '../lib/agencyBranding'

export function PortalPreview() {
  const data = useMemo(() => readPortalPreview(), [])

  const brandColor = normalizeBrandColor(data?.brandColor ?? DEFAULT_BRAND_COLOR)
  const agencyName = data?.name?.trim() || 'Mon agence'
  const welcomeMessage =
    data?.welcomeMessage?.trim() ||
    'Complétez les étapes ci-dessous pour démarrer votre projet. Cela prend environ 10 minutes.'

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
    <div
      className="min-h-screen bg-[var(--surface)]"
      style={{ ['--portal-accent' as string]: brandColor }}
    >
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--white)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="" className="h-8 w-auto rounded-[var(--radius-xs)]" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg font-display text-xs font-extrabold text-white"
                style={{ backgroundColor: brandColor }}
              >
                {agencyName.slice(0, 2).toUpperCase()}
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
                className="h-full rounded-full transition-all"
                style={{ width: '33%', backgroundColor: brandColor }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">
        <div className="mb-4 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-3 py-2 text-center text-xs font-body text-[var(--accent)]">
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
          <button
            type="button"
            className="mt-5 rounded-[var(--radius-sm)] px-6 py-3 text-sm font-body font-medium text-white shadow-sm"
            style={{ backgroundColor: brandColor }}
          >
            Commencer →
          </button>
        </div>

        {(data.contactEmail || data.contactPhone) && (
          <footer className="mt-8 border-t border-[var(--border)] pt-6 text-center text-xs font-body text-[var(--ink-muted)]">
            {data.contactEmail ? <p>{data.contactEmail}</p> : null}
            {data.contactPhone ? <p className="mt-1">{data.contactPhone}</p> : null}
          </footer>
        )}
      </main>
    </div>
  )
}
