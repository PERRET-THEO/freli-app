import { describe, expect, it } from 'vitest'
import {
  countConsecutiveAutoReminders,
  isReminderCapReached,
  lastClientActivityAnchor,
} from './reminderCap'

describe('reminderCap', () => {
  it('compte les autos postérieures à la dernière soumission client', () => {
    const anchor = lastClientActivityAnchor({
      maxSubmittedAt: '2026-10-01T10:00:00.000Z',
      lastPortalVisitAt: null,
      reminderCapResetAt: null,
    })
    const count = countConsecutiveAutoReminders(
      [
        { source: 'auto', status: 'sent', sent_at: '2026-10-02T10:00:00.000Z' },
        { source: 'auto', status: 'sent', sent_at: '2026-10-04T10:00:00.000Z' },
        { source: 'auto', status: 'sent', sent_at: '2026-10-06T10:00:00.000Z' },
        { source: 'auto', status: 'sent', sent_at: '2026-09-20T10:00:00.000Z' },
        { source: 'manual', status: 'sent', sent_at: '2026-10-07T10:00:00.000Z' },
        { source: 'auto', status: 'failed', sent_at: '2026-10-08T10:00:00.000Z' },
      ],
      anchor,
    )
    expect(count).toBe(3)
    expect(isReminderCapReached(count, 3)).toBe(true)
  })

  it('remet le compteur à zéro après réponse client', () => {
    const anchor = lastClientActivityAnchor({
      maxSubmittedAt: '2026-10-10T12:00:00.000Z',
      lastPortalVisitAt: null,
      reminderCapResetAt: null,
    })
    const count = countConsecutiveAutoReminders(
      [
        { source: 'auto', status: 'sent', sent_at: '2026-10-02T10:00:00.000Z' },
        { source: 'auto', status: 'sent', sent_at: '2026-10-04T10:00:00.000Z' },
        { source: 'auto', status: 'sent', sent_at: '2026-10-06T10:00:00.000Z' },
      ],
      anchor,
    )
    expect(count).toBe(0)
    expect(isReminderCapReached(count, 3)).toBe(false)
  })

  it('remet le compteur à zéro après reminder_cap_reset_at', () => {
    const anchor = lastClientActivityAnchor({
      maxSubmittedAt: '2026-09-01T00:00:00.000Z',
      lastPortalVisitAt: null,
      reminderCapResetAt: '2026-10-15T08:00:00.000Z',
    })
    const count = countConsecutiveAutoReminders(
      [
        { source: 'auto', status: 'sent', sent_at: '2026-10-02T10:00:00.000Z' },
        { source: 'auto', status: 'sent', sent_at: '2026-10-16T10:00:00.000Z' },
      ],
      anchor,
    )
    expect(count).toBe(1)
  })
})
