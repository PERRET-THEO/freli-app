export const DEFAULT_PORTFOLIO_LABEL = 'Voir mon portfolio'

/** Valide et normalise une URL portfolio https uniquement. */
export function normalizePortfolioUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null

  let url: URL
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`)
  } catch {
    return null
  }

  if (url.protocol !== 'https:') return null
  if (!url.hostname || url.hostname === 'localhost') return null

  return url.toString()
}

export function isValidPortfolioUrl(raw: string | null | undefined): boolean {
  if (!(raw ?? '').trim()) return true
  return normalizePortfolioUrl(raw) !== null
}

export function resolvePortfolioLabel(label: string | null | undefined): string {
  const trimmed = (label ?? '').trim()
  return trimmed || DEFAULT_PORTFOLIO_LABEL
}
