import { supabase } from './supabase'
import { formatRetryAfterMessage } from './projectInvite'

type CompletedEmailPayload = {
  projectId: string
  projectToken: string
}

export class InviteRateLimitError extends Error {
  readonly retryAfterMs: number
  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'InviteRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

export type SendProjectInviteResult = {
  accepted?: true
  status?: 'sent'
  invite_sent_at?: string
  recipient?: string
}

/**
 * Déclenche l'envoi d'invitation.
 * - Création / retry : 202 async (accepted).
 * - resend: true : synchrone 200 { status:'sent', invite_sent_at } ou erreur.
 */
export async function sendProjectInviteEmail(payload: {
  projectId: string
  force?: boolean
  resend?: boolean
  clientEmail?: string
}): Promise<SendProjectInviteResult> {
  const { data, error } = await supabase.functions.invoke('send-project-invite', {
    body: {
      projectId: payload.projectId,
      mode: 'invite',
      ...(payload.force ? { force: true } : {}),
      ...(payload.resend ? { resend: true } : {}),
      ...(payload.clientEmail ? { clientEmail: payload.clientEmail } : {}),
    },
  })

  const readRetry = (payloadData: unknown): number => {
    const raw = (payloadData as { retry_after_ms?: number } | null)?.retry_after_ms
    return typeof raw === 'number' && raw > 0 ? raw : 60_000
  }

  if (error) {
    const ctx = error as { context?: Response; message?: string }
    if (ctx.context?.status === 202) return { accepted: true as const }
    if (ctx.context?.status === 429) {
      let body: { message?: string; retry_after_ms?: number } | null = null
      try {
        body = (await ctx.context.clone().json()) as {
          message?: string
          retry_after_ms?: number
        }
      } catch {
        body = null
      }
      const retryAfterMs = body?.retry_after_ms ?? readRetry(data)
      throw new InviteRateLimitError(
        body?.message ?? formatRetryAfterMessage(retryAfterMs),
        retryAfterMs,
      )
    }
    throw new Error(error.message)
  }

  if (data?.error === 'rate_limited' || data?.error === 'daily_cap') {
    const retryAfterMs = readRetry(data)
    throw new InviteRateLimitError(
      String(data.message ?? formatRetryAfterMessage(retryAfterMs)),
      retryAfterMs,
    )
  }

  if (data?.error) {
    throw new Error(String(data.message ?? data.error))
  }

  if (payload.resend) {
    return {
      status: 'sent',
      invite_sent_at: data?.invite_sent_at as string | undefined,
      recipient: data?.recipient as string | undefined,
    }
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
  return data
}
