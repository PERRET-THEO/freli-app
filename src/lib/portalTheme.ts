import { DEFAULT_BRAND_COLOR, normalizeBrandColor } from './agencyBranding'

export type PortalThemeTokens = {
  accent: string
  accentFg: string
  accentHover: string
  accentSoft: string
  accentBorder: string
  /** Ratio accent vs chosen foreground (button label). */
  buttonContrast: number
  /** Ratio accent vs white page background (links / UI). */
  onWhiteContrast: number
  passesButtonAa: boolean
  passesOnWhiteUi: boolean
}

const FG_DARK = '#0d0f14'
const FG_LIGHT = '#ffffff'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function channelLuminance(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(normalizeBrandColor(hex))
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA)
  const l2 = relativeLuminance(hexB)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function pickForeground(accentHex: string): string {
  const accent = normalizeBrandColor(accentHex)
  const whiteRatio = contrastRatio(accent, FG_LIGHT)
  const darkRatio = contrastRatio(accent, FG_DARK)
  return whiteRatio >= darkRatio ? FG_LIGHT : FG_DARK
}

function mixToward(hex: string, target: string, amount: number): string {
  const a = hexToRgb(normalizeBrandColor(hex))
  const b = hexToRgb(normalizeBrandColor(target))
  const mix = (x: number, y: number) => Math.round(x + (y - x) * amount)
  const r = mix(a.r, b.r).toString(16).padStart(2, '0')
  const g = mix(a.g, b.g).toString(16).padStart(2, '0')
  const bl = mix(a.b, b.b).toString(16).padStart(2, '0')
  return `#${r}${g}${bl}`
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(normalizeBrandColor(hex))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function derivePortalTokens(rawAccent: string | null | undefined): PortalThemeTokens {
  const accent = normalizeBrandColor(rawAccent ?? DEFAULT_BRAND_COLOR)
  const accentFg = pickForeground(accent)
  const buttonContrast = contrastRatio(accent, accentFg)
  const onWhiteContrast = contrastRatio(accent, FG_LIGHT)

  return {
    accent,
    accentFg,
    accentHover: mixToward(accent, FG_DARK, 0.14),
    accentSoft: withAlpha(accent, 0.08),
    accentBorder: withAlpha(accent, 0.28),
    buttonContrast,
    onWhiteContrast,
    passesButtonAa: buttonContrast >= 4.5,
    passesOnWhiteUi: onWhiteContrast >= 3,
  }
}

/** Inline CSS variables for the portal root container. */
export function portalThemeStyle(rawAccent: string | null | undefined): Record<string, string> {
  const t = derivePortalTokens(rawAccent)
  return {
    '--accent': t.accent,
    '--portal-accent': t.accent,
    '--portal-accent-fg': t.accentFg,
    '--portal-accent-hover': t.accentHover,
    '--portal-accent-soft': t.accentSoft,
    '--portal-accent-border': t.accentBorder,
  }
}

export function agencyInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}
