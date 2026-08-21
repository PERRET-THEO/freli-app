import { supabase } from './supabase'

export type WaitlistSubmitResult =
  | { ok: true; alreadyRegistered: boolean }
  | { ok: false; error: string }

const FALLBACK_ERROR = 'Impossible d’enregistrer l’inscription. Réessayez dans un instant.'

export async function submitWaitlistSignup(input: {
  firstName: string
  email: string
  consent: boolean
}): Promise<WaitlistSubmitResult> {
  const { data, error } = await supabase.functions.invoke('submit-waitlist-signup', {
    body: {
      firstName: input.firstName,
      email: input.email,
      consent: input.consent,
      website: '',
    },
  })

  if (error) {
    const message = await invokeErrorMessage(error, data)
    return { ok: false, error: message }
  }
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return { ok: false, error: data.error }
  }
  const alreadyRegistered =
    Boolean(data && typeof data === 'object' && 'alreadyRegistered' in data && data.alreadyRegistered)
  return { ok: true, alreadyRegistered }
}

export async function unsubscribeWaitlist(token: string): Promise<WaitlistSubmitResult> {
  const { data, error } = await supabase.functions.invoke('submit-waitlist-signup', {
    body: { action: 'unsubscribe', token },
  })
  if (error) {
    const message = await invokeErrorMessage(error, data)
    return { ok: false, error: message }
  }
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return { ok: false, error: data.error }
  }
  return { ok: true, alreadyRegistered: false }
}

async function invokeErrorMessage(error: { message?: string; context?: Response }, data: unknown) {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  const context = error.context
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string }
      if (typeof body?.error === 'string' && body.error.trim()) return body.error
    } catch {
      // ignore parse errors
    }
  }
  return error.message?.trim() || FALLBACK_ERROR
}
