import { BRAND_COLOR_PRESETS, DEFAULT_BRAND_COLOR } from '../../lib/agencyBranding'

type BrandColorPickerProps = {
  value: string
  onChange: (color: string) => void
}

export function BrandColorPicker({ value, onChange }: BrandColorPickerProps) {
  const normalized = value || DEFAULT_BRAND_COLOR

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
      <p className="text-xs font-body text-[var(--ink-muted)]">
        Appliquée aux boutons et à la barre de progression du portail client.
      </p>
    </div>
  )
}
