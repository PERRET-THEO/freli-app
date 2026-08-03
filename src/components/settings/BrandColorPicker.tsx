import { BRAND_COLOR_PRESETS, DEFAULT_BRAND_COLOR } from '../../lib/agencyBranding'
import { derivePortalTokens } from '../../lib/portalTheme'

type BrandColorPickerProps = {
  value: string
  onChange: (color: string) => void
}

export function BrandColorPicker({ value, onChange }: BrandColorPickerProps) {
  const normalized = value || DEFAULT_BRAND_COLOR
  const tokens = derivePortalTokens(normalized)

  return (
    <div className="space-y-3">
      <p className="text-sm font-body font-medium text-[var(--ink-soft)]">Couleur d&apos;accent du portail</p>
      <div className="flex flex-wrap gap-2">
        {BRAND_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            title={preset.label}
            onClick={() => onChange(preset.value)}
            className={`h-9 w-9 rounded-full ring-2 ring-offset-2 transition ${
              normalized.toLowerCase() === preset.value.toLowerCase()
                ? 'ring-[var(--ink)]'
                : 'ring-transparent hover:ring-[var(--border)]'
            }`}
            style={{ backgroundColor: preset.value }}
            aria-label={preset.label}
          />
        ))}
        <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--white)]">
          <span className="text-xs font-body text-[var(--ink-muted)]">+</span>
          <input
            type="color"
            value={normalized}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Couleur personnalisée"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <span
          className="inline-flex min-h-9 items-center rounded-full px-3 text-xs font-body font-medium"
          style={{ backgroundColor: tokens.accent, color: tokens.accentFg }}
        >
          Aperçu bouton
        </span>
        <span className="font-body text-xs text-[var(--ink-muted)]">
          Contraste {tokens.buttonContrast.toFixed(1)}:1
        </span>
      </div>
      {!tokens.passesOnWhiteUi ? (
        <p className="rounded-[var(--radius-sm)] bg-[var(--amber-soft)] px-3 py-2 text-xs font-body text-[var(--ink)]">
          Cette couleur est peu contrastée sur fond clair (ratio{' '}
          {tokens.onWhiteContrast.toFixed(1)}:1). Les liens et accents peuvent être difficiles à
          lire — ce n&apos;est pas bloquant.
        </p>
      ) : null}
      <p className="text-xs font-body text-[var(--ink-muted)]">
        Appliquée aux boutons et à la barre de progression du portail client. Le texte du bouton
        s&apos;adapte automatiquement (noir ou blanc).
      </p>
    </div>
  )
}
