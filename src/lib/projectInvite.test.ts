import { describe, expect, it } from 'vitest'
import { canResendInvite, INVITE_RESEND_COOLDOWN_MS } from './projectInvite'

describe('canResendInvite', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z')

  it('blocks during cooldown after last attempt', () => {
    const last = new Date(now - 10_000).toISOString()
    expect(
      canResendInvite({ inviteStatus: 'failed', inviteLastAttemptAt: last, now }),
    ).toEqual({ ok: false, reason: 'cooldown' })
  })

  it('allows resend after cooldown', () => {
    const last = new Date(now - INVITE_RESEND_COOLDOWN_MS - 1).toISOString()
    expect(
      canResendInvite({ inviteStatus: 'failed', inviteLastAttemptAt: last, now }),
    ).toEqual({ ok: true })
  })

  it('treats recent pending as sending', () => {
    const last = new Date(now - 5_000).toISOString()
    expect(
      canResendInvite({ inviteStatus: 'pending', inviteLastAttemptAt: last, now }),
    ).toEqual({ ok: false, reason: 'sending' })
  })
})
