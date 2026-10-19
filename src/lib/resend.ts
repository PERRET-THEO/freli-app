import { supabase } from './supabase'
import {
  edgeFunctionErrorMessage,
  readEdgeFunctionError,
} from './edgeFunctionError'
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

async function throwFromInvokeError(
  error: { message?: string; context?: Response } | null,
  data: unknown,
): Promise<never> {
  const parsed = await readEdgeFunctionError(error, data)
  const message = edgeFunctionErrorMessage(parsed)
  const status = error?.context?.status
  const isRateLimit =
    status === 429 ||
    parsed.error === 'rate_limited' ||
    parsed.error === 'daily_cap'

  if (isRateLimit) {
    const retryAfterMs = parsed.retry_after_ms ?? 60_000
    throw new InviteRateLimitError(
      message || formatRetryAfterMessage(retryAfterMs),
      retryAfterMs,
    )
  }
  throw new Error(message)
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

  if (error) {
    const ctx = error as { context?: Response; message?: string }
    if (ctx.context?.status === 202) return { accepted: true as const }
    await throwFromInvokeError(ctx, data)
  }

  if (data?.error === 'rate_limited' || data?.error === 'daily_cap') {
    const retryAfterMs =
      typeof data.retry_after_ms === 'number' && data.retry_after_ms > 0
        ? data.retry_after_ms
        : 60_000
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
  if (error) await throwFromInvokeError(error, data)
  if (data?.error) throw new Error(String(data.message ?? data.error))
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
  if (error) await throwFromInvokeError(error, data)
  if (data?.error) throw new Error(String(data.message ?? data.error))
  return data
}
