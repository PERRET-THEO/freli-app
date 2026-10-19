/** Helpers renvoi manuel d'invitation (tests Deno / logique pure). */

export const INVITE_MANUAL_COOLDOWN_MS = 10 * 60_000
export const INVITE_FIRST_FAIL_COOLDOWN_MS = 30_000
export const INVITE_MANUAL_DAILY_CAP = 5

export function manualResendCooldownMs(opts: {
  inviteStatus: string | null | undefined
  inviteSentAt: string | null | undefined
}): number {
  if (opts.inviteStatus === 'failed' && !opts.inviteSentAt) {
    return INVITE_FIRST_FAIL_COOLDOWN_MS
  }
  return INVITE_MANUAL_COOLDOWN_MS
}

export function isValidInviteEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(raw.trim())
}

export function formatRetryAfterMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000))
  return `Vous pourrez renvoyer l'invitation dans ${minutes} min.`
}
