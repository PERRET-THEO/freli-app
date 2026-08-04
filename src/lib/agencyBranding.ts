export const DEFAULT_BRAND_COLOR = '#5b6ef5'

export const BRAND_COLOR_PRESETS = [
  { label: 'Indigo', value: '#5b6ef5' },
  { label: 'Émeraude', value: '#2dd4a0' },
  { label: 'Corail', value: '#ef4444' },
  { label: 'Ambre', value: '#f5a623' },
  { label: 'Violet', value: '#8b5cf6' },
] as const

export type AgencyBranding = {
  id: string
  name: string
  logo_url: string | null
  plan: string | null
  brand_color: string | null
  portal_welcome_message: string | null
  tagline: string | null
  contact_email: string | null
  contact_phone: string | null
  portal_help_title: string | null
  portal_help_text: string | null
  portal_availability: string | null
  portfolio_url: string | null
  portfolio_label: string | null
  portal_locale: string | null
  auto_reminders_enabled: boolean | null
  auto_reminders_delay_hours: number | null
  ai_extraction_enabled: boolean | null
  ai_reminders_enabled: boolean | null
  ai_contracts_enabled: boolean | null
  ai_reminder_tone: string | null
  ai_reminder_auto_send: boolean | null
  ai_reminder_max_per_project: number | null
  ai_reminder_send_hour_start: number | null
  ai_reminder_send_hour_end: number | null
  legal_form: string | null
  address_street: string | null
  address_postal_code: string | null
  address_city: string | null
  siret: string | null
  share_capital: string | null
  vat_number: string | null
  rcs_city: string | null
  siren: string | null
  code_naf: string | null
  source_donnees_legales: string | null
}

export type PortalPreviewData = {
  name: string
  logoUrl: string | null
  brandColor: string
  tagline: string
  welcomeMessage: string
  contactEmail: string
  contactPhone: string
  helpTitle: string
  helpText: string
  availability: string
  portfolioUrl: string
  portfolioLabel: string
}

export const PORTAL_PREVIEW_STORAGE_KEY = 'freli-portal-preview'

export function normalizeBrandColor(raw: string | null | undefined): string {
  const value = (raw ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase()
  return DEFAULT_BRAND_COLOR
}

/** Blob URLs ne sont pas partageables entre onglets — convertir en data URL si besoin. */
export async function resolveLogoUrlForPreview(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null
  if (!logoUrl.startsWith('blob:')) return logoUrl
  try {
    const res = await fetch(logoUrl)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Impossible de lire le logo'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export function storePortalPreview(data: PortalPreviewData): void {
  localStorage.setItem(PORTAL_PREVIEW_STORAGE_KEY, JSON.stringify(data))
}

export function readPortalPreview(): PortalPreviewData | null {
  try {
    const raw =
      localStorage.getItem(PORTAL_PREVIEW_STORAGE_KEY) ??
      sessionStorage.getItem(PORTAL_PREVIEW_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PortalPreviewData
  } catch {
    return null
  }
}
