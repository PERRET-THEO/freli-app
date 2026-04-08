import { supabase } from './supabase'

export type InviteUserResult =
  | { ok: true }
  | { ok: false; error: string; code?: 'already_registered' | 'unauthorized' }

/**
 * Envoie une invitation Supabase Auth (email + lien vers /signup).
 * Nécessite la Edge Function `invite-user` déployée et un utilisateur connecté (JWT).
 */
export async function inviteAgencyUser(email: string): Promise<InviteUserResult> {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: { email: email.trim().toLowerCase() },
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  const payload = data as { error?: string; ok?: boolean } | null
  if (payload?.error) {
    const lower = payload.error.toLowerCase()
    if (lower.includes('already') || payload.error === 'already_registered') {
      return { ok: false, error: 'Cet email a déjà un compte.', code: 'already_registered' }
    }
    return { ok: false, error: payload.error }
  }

  if (payload?.ok) return { ok: true }
  return { ok: false, error: 'Réponse inattendue du serveur.' }
}
