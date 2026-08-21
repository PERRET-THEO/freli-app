import type { ReactNode } from 'react'
import { FeatureVisual, type FeatureVisualId } from '../landing/FeatureVisuals'

type LaunchProductFrameProps = {
  visualId?: FeatureVisualId
  children?: ReactNode
  className?: string
}

/** Cadre type fenêtre app autour d’un mock produit (hero). */
export function LaunchProductFrame({
  visualId = 'portal-checklist',
  children,
  className = '',
}: LaunchProductFrameProps) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--white)] shadow-[0_24px_64px_rgba(13,15,20,0.12),0_0_0_1px_rgba(13,15,20,0.04)] ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2.5 sm:px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(13,15,20,0.15)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(13,15,20,0.15)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(13,15,20,0.15)]" />
        <span className="ml-2 truncate font-body text-[11px] text-[var(--ink-muted)]">
          freli.fr/p/studio-nova
        </span>
      </div>
      <div className="bg-[var(--surface)] p-0">
        {children ?? <FeatureVisual id={visualId} size="hero" />}
      </div>
    </div>
  )
}
