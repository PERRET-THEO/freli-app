import { describe, expect, it } from 'vitest'
import {
  formatRetryAfterMessage,
  INVITE_FIRST_FAIL_COOLDOWN_MS,
  INVITE_MANUAL_COOLDOWN_MS,
  isValidInviteEmail,
  manualResendCooldownMs,
} from './inviteResend.ts'

describe('inviteResend helpers', () => {
  it('choisit le cooldown 30s vs 10 min', () => {
    expect(manualResendCooldownMs({ inviteStatus: 'failed', inviteSentAt: null })).toBe(
      INVITE_FIRST_FAIL_COOLDOWN_MS,
    )
    expect(
      manualResendCooldownMs({
        inviteStatus: 'sent',
        inviteSentAt: '2026-10-18T12:00:00.000Z',
      }),
    ).toBe(INVITE_MANUAL_COOLDOWN_MS)
  })

  it('valide les emails', () => {
    expect(isValidInviteEmail('a@b.co')).toBe(true)
    expect(isValidInviteEmail('pas-un-email')).toBe(false)
  })

  it('vouvoie le message de retry', () => {
    expect(formatRetryAfterMessage(120_000)).toMatch(/Vous pourrez renvoyer/)
  })
})
