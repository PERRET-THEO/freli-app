import { describe, expect, it } from 'vitest'
import { groupClientDocuments, mapClientDocuments } from './clientDocuments'

describe('mapClientDocuments', () => {
  it('groups signed contracts, AI docs and uploaded files', () => {
    const items = mapClientDocuments({
      projects: [{ id: 'p1', client_name: 'Acme' }],
      checklist: [
        {
          id: 's1',
          project_id: 'p1',
          label: 'Contrat',
          type: 'signature',
          completed: true,
          value: 'https://signed.example',
          submitted_at: '2026-01-02T00:00:00.000Z',
          reviewed_at: '2026-01-02T01:00:00.000Z',
        },
        {
          id: 'f1',
          project_id: 'p1',
          label: 'Logo',
          type: 'file',
          completed: true,
          value: 'documents/p1/logo.png',
          submitted_at: '2026-01-01T00:00:00.000Z',
          reviewed_at: null,
        },
      ],
      generated: [
        {
          id: 'g1',
          project_id: 'p1',
          status: 'finalized',
          created_at: '2026-01-03T00:00:00.000Z',
          finalized_at: '2026-01-03T02:00:00.000Z',
          brief: 'Proposition site vitrine',
        },
      ],
    })

    const groups = groupClientDocuments(items)
    expect(groups.signed).toHaveLength(1)
    expect(groups.files).toHaveLength(1)
    expect(groups.ai).toHaveLength(1)
    expect(items[0]?.kind).toBe('ai_document')
  })
})
