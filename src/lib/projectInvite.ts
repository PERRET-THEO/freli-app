export type ProjectInviteStatus = 'pending' | 'sent' | 'failed'

export const INVITE_RESEND_COOLDOWN_MS = 30_000

export function canResendInvite(opts: {
  inviteStatus: ProjectInviteStatus | null | undefined
  inviteLastAttemptAt: string | null | undefined
  now?: number
}): { ok: true } | { ok: false; reason: 'cooldown' | 'sending' } {
  if (opts.inviteStatus === 'pending') {
    const last = opts.inviteLastAttemptAt
      ? new Date(opts.inviteLastAttemptAt).getTime()
      : 0
    const now = opts.now ?? Date.now()
    // Still "in flight" if last attempt was recent
    if (last && now - last < INVITE_RESEND_COOLDOWN_MS) {
      return { ok: false, reason: 'sending' }
    }
  }
  if (opts.inviteLastAttemptAt) {
    const elapsed = (opts.now ?? Date.now()) - new Date(opts.inviteLastAttemptAt).getTime()
    if (elapsed < INVITE_RESEND_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' }
    }
  }
  return { ok: true }
}

export function formatInviteSentAt(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}
