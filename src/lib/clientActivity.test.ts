import { describe, expect, it } from 'vitest'
import { mergeClientActivityEvents, paginateActivityEvents } from './clientActivity'

describe('mergeClientActivityEvents', () => {
  it('merges reminders, files, signatures and project creation newest first', () => {
    const events = mergeClientActivityEvents({
      projects: [
        {
          id: 'p1',
          client_name: 'Acme',
          created_at: '2026-01-01T10:00:00.000Z',
        },
      ],
      reminders: [
        {
          id: 'r1',
          project_id: 'p1',
          source: 'auto',
          sent_at: '2026-01-03T10:00:00.000Z',
        },
      ],
      checklist: [
        {
          id: 'c1',
          project_id: 'p1',
          label: 'Logo',
          type: 'file',
          completed: true,
          submitted_at: '2026-01-02T10:00:00.000Z',
          reviewed_at: null,
          value: 'documents/x/logo.png',
        },
        {
          id: 'c2',
          project_id: 'p1',
          label: 'Contrat',
          type: 'signature',
          completed: true,
          submitted_at: '2026-01-04T10:00:00.000Z',
          reviewed_at: '2026-01-04T11:00:00.000Z',
          value: 'https://signed',
        },
      ],
      extractions: [],
    })

    expect(events[0]?.eventType).toBe('contract_signed')
    expect(events.map((e) => e.eventType)).toContain('reminder_sent')
    expect(events.map((e) => e.eventType)).toContain('document_received')
    expect(events.map((e) => e.eventType)).toContain('project_created')
  })
})

describe('paginateActivityEvents', () => {
  it('pages results', () => {
    const events = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      eventType: 'step_completed' as const,
      title: `e${i}`,
      occurredAt: new Date(2026, 0, i + 1).toISOString(),
      projectId: null,
      projectName: null,
    }))
    const page0 = paginateActivityEvents(events, 0, 20)
    expect(page0.items).toHaveLength(20)
    expect(page0.hasMore).toBe(true)
    expect(paginateActivityEvents(events, 1, 20).items).toHaveLength(5)
  })
})
