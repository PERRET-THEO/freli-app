import { describe, expect, it } from 'vitest'
import {
  canResendInvite,
  formatRetryAfterMessage,
  INVITE_FIRST_FAIL_COOLDOWN_MS,
  INVITE_MANUAL_RESEND_COOLDOWN_MS,
  inviteBannerLabel,
  manualResendCooldownMs,
  shouldHighlightResendInvite,
  shouldShowResendInvite,
} from './projectInvite'

describe('manualResendCooldownMs', () => {
  it('uses 30s for first failure never sent', () => {
    expect(
      manualResendCooldownMs({ inviteStatus: 'failed', inviteSentAt: null }),
    ).toBe(INVITE_FIRST_FAIL_COOLDOWN_MS)
  })

  it('uses 10 min after a successful send', () => {
    expect(
      manualResendCooldownMs({
        inviteStatus: 'sent',
        inviteSentAt: '2026-10-18T12:00:00.000Z',
      }),
    ).toBe(INVITE_MANUAL_RESEND_COOLDOWN_MS)
  })
})

describe('canResendInvite', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z')

  it('blocks during 10 min cooldown after a sent invite', () => {
    const last = new Date(now - 5 * 60_000).toISOString()
    const gate = canResendInvite({
      inviteStatus: 'sent',
      inviteSentAt: '2026-10-18T11:00:00.000Z',
      inviteLastAttemptAt: last,
      now,
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toBe('cooldown')
  })

  it('allows resend after 10 min', () => {
    const last = new Date(now - INVITE_MANUAL_RESEND_COOLDOWN_MS - 1).toISOString()
    expect(
      canResendInvite({
        inviteStatus: 'sent',
        inviteSentAt: last,
        inviteLastAttemptAt: last,
        now,
      }),
    ).toEqual({ ok: true })
  })

  it('uses 30s cooldown for first failed send', () => {
    const last = new Date(now - 10_000).toISOString()
    const blocked = canResendInvite({
      inviteStatus: 'failed',
      inviteSentAt: null,
      inviteLastAttemptAt: last,
      now,
    })
    expect(blocked.ok).toBe(false)

    const ready = canResendInvite({
      inviteStatus: 'failed',
      inviteSentAt: null,
      inviteLastAttemptAt: new Date(now - INVITE_FIRST_FAIL_COOLDOWN_MS - 1).toISOString(),
      now,
    })
    expect(ready).toEqual({ ok: true })
  })

  it('hides for completed projects', () => {
    expect(
      canResendInvite({
        inviteStatus: 'sent',
        inviteLastAttemptAt: null,
        projectStatus: 'completed',
        now,
      }),
    ).toEqual({ ok: false, reason: 'completed' })
  })

  it('blocks at daily cap', () => {
    const gate = canResendInvite({
      inviteStatus: 'sent',
      inviteLastAttemptAt: null,
      resendCount24h: 5,
      now,
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toBe('daily_cap')
  })
})

describe('invite UI helpers', () => {
  it('hides button when completed', () => {
    expect(shouldShowResendInvite({ projectStatus: 'completed' })).toBe(false)
    expect(shouldShowResendInvite({ projectStatus: 'in_progress' })).toBe(true)
  })

  it('highlights when failed or never visited', () => {
    expect(
      shouldHighlightResendInvite({ inviteStatus: 'failed', lastPortalVisitAt: null }),
    ).toBe(true)
    expect(
      shouldHighlightResendInvite({
        inviteStatus: 'sent',
        lastPortalVisitAt: '2026-10-18T12:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('labels banner envoyée vs renvoyée', () => {
    expect(
      inviteBannerLabel({
        inviteStatus: 'sent',
        inviteSentAt: '2026-10-18T12:00:00.000Z',
        inviteError: null,
        hasManualResend: false,
      }).text,
    ).toMatch(/^Invitation envoyée/)
    expect(
      inviteBannerLabel({
        inviteStatus: 'sent',
        inviteSentAt: '2026-10-18T12:00:00.000Z',
        inviteError: null,
        hasManualResend: true,
      }).text,
    ).toMatch(/^Invitation renvoyée/)
  })

  it('formats retry message', () => {
    expect(formatRetryAfterMessage(90_000)).toBe(
      "Vous pourrez renvoyer l'invitation dans 2 min.",
    )
  })
})
