export type ProjectInviteStatus = 'pending' | 'sent' | 'failed'

/** Premier échec (jamais envoyé) — aligné NewProject / correction faute. */
export const INVITE_FIRST_FAIL_COOLDOWN_MS = 30_000
/** Renvoi manuel standard. */
export const INVITE_MANUAL_RESEND_COOLDOWN_MS = 10 * 60_000
/** @deprecated Prefer INVITE_MANUAL_RESEND_COOLDOWN_MS / first-fail. */
export const INVITE_RESEND_COOLDOWN_MS = INVITE_FIRST_FAIL_COOLDOWN_MS

export const INVITE_MANUAL_DAILY_CAP = 5

export function manualResendCooldownMs(opts: {
  inviteStatus: ProjectInviteStatus | null | undefined
  inviteSentAt: string | null | undefined
}): number {
  if (opts.inviteStatus === 'failed' && !opts.inviteSentAt) {
    return INVITE_FIRST_FAIL_COOLDOWN_MS
  }
  return INVITE_MANUAL_RESEND_COOLDOWN_MS
}

export function formatRetryAfterMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000))
  return `Vous pourrez renvoyer l'invitation dans ${minutes} min.`
}

export function shouldShowResendInvite(opts: {
  projectStatus: string | null | undefined
}): boolean {
  return opts.projectStatus !== 'completed'
}

export function shouldHighlightResendInvite(opts: {
  inviteStatus: ProjectInviteStatus | null | undefined
  lastPortalVisitAt: string | null | undefined
}): boolean {
  return opts.inviteStatus === 'failed' || !opts.lastPortalVisitAt
}

export function canResendInvite(opts: {
  inviteStatus: ProjectInviteStatus | null | undefined
  inviteLastAttemptAt: string | null | undefined
  inviteSentAt?: string | null
  projectStatus?: string | null
  resendCount24h?: number
  retryAfterMs?: number | null
  now?: number
}):
  | { ok: true }
  | { ok: false; reason: 'cooldown' | 'sending' | 'completed' | 'daily_cap'; retryAfterMs?: number } {
  if (opts.projectStatus === 'completed') {
    return { ok: false, reason: 'completed' }
  }

  if (
    typeof opts.resendCount24h === 'number' &&
    opts.resendCount24h >= INVITE_MANUAL_DAILY_CAP
  ) {
    return {
      ok: false,
      reason: 'daily_cap',
      retryAfterMs: opts.retryAfterMs ?? undefined,
    }
  }

  if (typeof opts.retryAfterMs === 'number' && opts.retryAfterMs > 0) {
    return { ok: false, reason: 'cooldown', retryAfterMs: opts.retryAfterMs }
  }

  const cooldownMs = manualResendCooldownMs({
    inviteStatus: opts.inviteStatus,
    inviteSentAt: opts.inviteSentAt,
  })
  const now = opts.now ?? Date.now()

  if (opts.inviteStatus === 'pending' && opts.inviteLastAttemptAt) {
    const elapsed = now - new Date(opts.inviteLastAttemptAt).getTime()
    if (elapsed < cooldownMs) {
      return {
        ok: false,
        reason: 'sending',
        retryAfterMs: cooldownMs - elapsed,
      }
    }
  }

  if (opts.inviteLastAttemptAt) {
    const elapsed = now - new Date(opts.inviteLastAttemptAt).getTime()
    if (elapsed < cooldownMs) {
      return {
        ok: false,
        reason: 'cooldown',
        retryAfterMs: cooldownMs - elapsed,
      }
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

export function inviteBannerLabel(opts: {
  inviteStatus: ProjectInviteStatus | null | undefined
  inviteSentAt: string | null | undefined
  inviteError: string | null | undefined
  /** Au moins un renvoi manuel (événements invite.resent). */
  hasManualResend?: boolean
}): { kind: 'sent' | 'pending' | 'failed' | 'none'; text: string } {
  if (!opts.inviteStatus) return { kind: 'none', text: '' }
  if (opts.inviteStatus === 'pending') {
    return { kind: 'pending', text: "Invitation en cours d'envoi…" }
  }
  if (opts.inviteStatus === 'failed') {
    return {
      kind: 'failed',
      text: `Échec de l'envoi${opts.inviteError ? ` — ${opts.inviteError}` : ''}.`,
    }
  }
  const when = formatInviteSentAt(opts.inviteSentAt)
  const verb = opts.hasManualResend ? 'renvoyée' : 'envoyée'
  return {
    kind: 'sent',
    text: when ? `Invitation ${verb} le ${when}` : `Invitation ${verb}`,
  }
}
