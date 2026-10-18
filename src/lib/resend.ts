import { supabase } from './supabase'

type CompletedEmailPayload = {
  projectId: string
  projectToken: string
}

/**
 * Déclenche l'envoi d'invitation (Edge Function répond 202, livraison en arrière-plan).
 * Ne throw pas sur 202 ; throw uniquement si la requête est refusée (auth, 4xx hors 202).
 */
export async function sendProjectInviteEmail(payload: { projectId: string; force?: boolean }) {
  const { data, error } = await supabase.functions.invoke('send-project-invite', {
    body: {
      projectId: payload.projectId,
      mode: 'invite',
      ...(payload.force ? { force: true } : {}),
    },
  })

  // supabase-js treats non-2xx as error; 202 is success for async invite
  if (error) {
    const ctx = error as { context?: Response; message?: string }
    if (ctx.context?.status === 202) return { accepted: true as const }
    if (ctx.context?.status === 429) {
      throw new Error('Attendez quelques secondes avant de renvoyer.')
    }
    throw new Error(error.message)
  }
  if (data?.error && data.error !== 'rate_limited') {
    throw new Error(String(data.error))
  }
  if (data?.error === 'rate_limited') {
    throw new Error(data.message ?? 'Attendez quelques secondes avant de renvoyer.')
  }
  return { accepted: true as const }
}

export async function sendProjectCompletedEmail(payload: CompletedEmailPayload) {
  const { data, error } = await supabase.functions.invoke('send-project-completed-notification', {
    body: payload,
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
}

export async function sendProjectReminderEmail(payload: { projectId: string }) {
  if (!payload.projectId) {
    throw new Error('projectId requis pour la relance email.')
  }

  const { data, error } = await supabase.functions.invoke('send-project-invite', {
    body: {
      projectId: payload.projectId,
      mode: 'reminder',
      source: 'manual',
    },
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
}
