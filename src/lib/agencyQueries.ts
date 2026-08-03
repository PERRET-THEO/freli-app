import { supabase } from './supabase'
import type { AgencyBranding } from './agencyBranding'
import { DEFAULT_PORTAL_HELP_TITLE } from './portalWelcomeTemplate'
import { DEFAULT_PORTFOLIO_LABEL } from './portfolioUrl'

/** Colonnes agence stables (avant migrations portail help / portfolio). */
export const AGENCY_SELECT_BASE =
  'id, name, logo_url, plan, brand_color, portal_welcome_message, tagline, contact_email, contact_phone, auto_reminders_enabled, auto_reminders_delay_hours, legal_form, address_street, address_postal_code, address_city, siret, share_capital, vat_number, rcs_city, siren, code_naf, source_donnees_legales'

export const AGENCY_SELECT_PORTAL_EXTRA =
  'portal_help_title, portal_help_text, portal_availability, portfolio_url, portfolio_label, portal_locale'

/** Colonnes ajoutées par les migrations IA — requête séparée pour tolérer leur absence. */
export const AGENCY_SELECT_AI =
  'ai_extraction_enabled, ai_reminders_enabled, ai_contracts_enabled, ai_reminder_tone, ai_reminder_auto_send, ai_reminder_max_per_project'

export type AgencyAiFlags = Pick<
  AgencyBranding,
  | 'ai_extraction_enabled'
  | 'ai_reminders_enabled'
  | 'ai_contracts_enabled'
  | 'ai_reminder_tone'
  | 'ai_reminder_auto_send'
  | 'ai_reminder_max_per_project'
>

export type AgencyPortalExtras = Pick<
  AgencyBranding,
  | 'portal_help_title'
  | 'portal_help_text'
  | 'portal_availability'
  | 'portfolio_url'
  | 'portfolio_label'
  | 'portal_locale'
>

const AI_DEFAULTS: AgencyAiFlags = {
  ai_extraction_enabled: false,
  ai_reminders_enabled: false,
  ai_contracts_enabled: false,
  ai_reminder_tone: 'professional',
  ai_reminder_auto_send: false,
  ai_reminder_max_per_project: 3,
}

const PORTAL_EXTRA_DEFAULTS: AgencyPortalExtras = {
  portal_help_title: DEFAULT_PORTAL_HELP_TITLE,
  portal_help_text: null,
  portal_availability: null,
  portfolio_url: null,
  portfolio_label: DEFAULT_PORTFOLIO_LABEL,
  portal_locale: 'fr',
}

/** Charge les flags IA si les migrations sont appliquées ; sinon valeurs par défaut. */
export async function fetchAgencyAiFlags(agencyId: string): Promise<AgencyAiFlags> {
  const { data, error } = await supabase
    .from('agencies')
    .select(AGENCY_SELECT_AI)
    .eq('id', agencyId)
    .maybeSingle()
  if (error || !data) return AI_DEFAULTS
  return { ...AI_DEFAULTS, ...(data as AgencyAiFlags) }
}

export async function fetchAgencyPortalExtras(agencyId: string): Promise<AgencyPortalExtras> {
  const { data, error } = await supabase
    .from('agencies')
    .select(AGENCY_SELECT_PORTAL_EXTRA)
    .eq('id', agencyId)
    .maybeSingle()
  if (error || !data) return PORTAL_EXTRA_DEFAULTS
  return { ...PORTAL_EXTRA_DEFAULTS, ...(data as AgencyPortalExtras) }
}

/** Fusionne une ligne agence avec flags IA + extras portail optionnels. */
export async function mergeAgencyWithAiFlags<T extends { id: string }>(
  base: T,
): Promise<T & AgencyAiFlags & AgencyPortalExtras> {
  const [ai, portal] = await Promise.all([
    fetchAgencyAiFlags(base.id),
    fetchAgencyPortalExtras(base.id),
  ])
  return { ...base, ...ai, ...portal }
}
