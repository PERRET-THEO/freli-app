import { describe, expect, it } from 'vitest'
import {
  categorizeClientBehavior,
  isWithinParisSendWindow,
} from './smartReminderBehavior.ts'

describe('categorizeClientBehavior', () => {
  it('returns stuck_on_step when portal visited', () => {
    const result = categorizeClientBehavior({
      lastPortalVisitAt: '2026-01-01T00:00:00Z',
      items: [
        { label: 'Identité', completed: true },
        { label: 'RIB', completed: false },
      ],
      emailEvents: { opened: 0, clicked: 0 },
    })
    expect(result.behaviorCategory).toBe('stuck_on_step')
    expect(result.blockingStepLabel).toBe('RIB')
  })

  it('returns stuck_on_step when checklist progressed without portal timestamp', () => {
    const result = categorizeClientBehavior({
      lastPortalVisitAt: null,
      items: [
        { label: 'Formulaire', completed: true },
        { label: 'Signature', completed: false },
      ],
      emailEvents: { opened: 5, clicked: 2 },
    })
    expect(result.behaviorCategory).toBe('stuck_on_step')
    expect(result.blockingStepLabel).toBe('Signature')
  })

  it('returns opened_not_clicked when clicked without portal', () => {
    const result = categorizeClientBehavior({
      lastPortalVisitAt: null,
      items: [
        { label: 'A', completed: false },
        { label: 'B', completed: false },
      ],
      emailEvents: { opened: 0, clicked: 1 },
    })
    expect(result.behaviorCategory).toBe('opened_not_clicked')
  })

  it('returns opened_not_clicked when opened without portal', () => {
    const result = categorizeClientBehavior({
      lastPortalVisitAt: null,
      items: [{ label: 'A', completed: false }],
      emailEvents: { opened: 2, clicked: 0 },
    })
    expect(result.behaviorCategory).toBe('opened_not_clicked')
  })

  it('returns not_opened by default', () => {
    const result = categorizeClientBehavior({
      lastPortalVisitAt: null,
      items: [{ label: 'A', completed: false }],
      emailEvents: { opened: 0, clicked: 0 },
    })
    expect(result.behaviorCategory).toBe('not_opened')
  })
})

describe('isWithinParisSendWindow', () => {
  it('treats equal start/end as always open', () => {
    expect(isWithinParisSendWindow(new Date(), 0, 0)).toBe(true)
  })

  it('includes start hour and excludes end hour on same-day span', () => {
    // 2026-06-15 10:30 UTC = 12:30 Paris (CEST, UTC+2)
    const noonishParis = new Date('2026-06-15T10:30:00.000Z')
    expect(isWithinParisSendWindow(noonishParis, 9, 19)).toBe(true)
    expect(isWithinParisSendWindow(noonishParis, 13, 19)).toBe(false)
    // 2026-06-15 17:00 UTC = 19:00 Paris → excluded when end=19
    const nineteenParis = new Date('2026-06-15T17:00:00.000Z')
    expect(isWithinParisSendWindow(nineteenParis, 9, 19)).toBe(false)
  })
})
