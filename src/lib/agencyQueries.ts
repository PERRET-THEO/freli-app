import { supabase } from './supabase'
import type { AgencyBranding } from './agencyBranding'

/** Colonnes agence disponibles avant migration des modules IA. */
export const AGENCY_SELECT_BASE =
  'id, name, logo_url, plan, brand_color, portal_welcome_message, tagline, contact_email, contact_phone, auto_reminders_enabled, auto_reminders_delay_hours, legal_form, address_street, address_postal_code, address_city, siret, share_capital, vat_number, rcs_city, siren, code_naf, source_donnees_legales'

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

const AI_DEFAULTS: AgencyAiFlags = {
  ai_extraction_enabled: false,
  ai_reminders_enabled: false,
  ai_contracts_enabled: false,
  ai_reminder_tone: 'professional',
  ai_reminder_auto_send: false,
  ai_reminder_max_per_project: 3,
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

/** Fusionne une ligne agence (sans colonnes IA) avec les flags IA optionnels. */
export async function mergeAgencyWithAiFlags<T extends { id: string }>(
  base: T,
): Promise<T & AgencyAiFlags> {
  const ai = await fetchAgencyAiFlags(base.id)
  return { ...base, ...ai }
}
