import { supabase } from './supabase'

export type AgencyRecord = {
  id: string
  name: string
}

/**
 * Returns the user's agency, creating a default one if missing.
 */
export async function getOrCreateAgency(
  userId: string,
  defaultName = 'Mon Agence',
): Promise<AgencyRecord | null> {
  const { data: existing, error: selectError } = await supabase
    .from('agencies')
    .select('id, name')
    .eq('user_id', userId)
    .maybeSingle()

  if (selectError) {
    console.warn('getOrCreateAgency select:', selectError.message)
    return null
  }

  if (existing?.id) {
    return { id: existing.id, name: existing.name ?? defaultName }
  }

  const { data: created, error: insertError } = await supabase
    .from('agencies')
    .insert({ user_id: userId, name: defaultName })
    .select('id, name')
    .single()

  if (insertError) {
    const { data: retry } = await supabase
      .from('agencies')
      .select('id, name')
      .eq('user_id', userId)
      .maybeSingle()
    if (retry?.id) {
      return { id: retry.id, name: retry.name ?? defaultName }
    }
    console.warn('getOrCreateAgency insert:', insertError.message)
    return null
  }

  if (!created?.id) return null
  return { id: created.id, name: created.name ?? defaultName }
}
