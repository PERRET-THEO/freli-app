import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui'
import type { PortalPreviewData } from '../../lib/agencyBranding'
import { resolveLogoUrlForPreview, storePortalPreview } from '../../lib/agencyBranding'

type PortalPreviewLinkProps = {
  data: PortalPreviewData
}

export function PortalPreviewLink({ data }: PortalPreviewLinkProps) {
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)

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

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-warm)] p-4">
      <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Aperçu rapide</p>
      <div
        className="mt-3 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--white)] shadow-sm"
        style={{ ['--portal-accent' as string]: data.brandColor }}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
          ) : (
            <div
              className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white"
              style={{ backgroundColor: data.brandColor }}
            >
              {data.name.slice(0, 2).toUpperCase()}
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
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-soft)]">
            {data.welcomeMessage ||
              'Complétez les étapes ci-dessous pour démarrer votre projet.'}
          </p>
          <div
            className="mt-3 inline-block rounded-full px-3 py-1 text-[11px] font-medium text-white"
            style={{ backgroundColor: data.brandColor }}
          >
            Commencer →
          </div>
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
