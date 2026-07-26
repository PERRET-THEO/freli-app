import { describe, expect, it } from 'vitest'
import {
  findProjectBottleneck,
  formatBottleneckAge,
  formatBottleneckLabel,
  isBottleneckStale,
  type BottleneckItem,
} from './projectBottleneck'

const createdAt = '2026-07-01T10:00:00.000Z'

function item(partial: Partial<BottleneckItem> & Pick<BottleneckItem, 'label' | 'order_index'>): BottleneckItem {
  return {
    type: 'text',
    completed: false,
    value: null,
    review_status: 'pending',
    submitted_at: null,
    reviewed_at: null,
    config: null,
    ...partial,
  }
}

describe('findProjectBottleneck', () => {
  it('pointe la première étape non complétée côté client', () => {
    const bottleneck = findProjectBottleneck(
      [
        item({
          label: 'Brief',
          order_index: 0,
          completed: true,
          review_status: 'approved',
          submitted_at: '2026-07-01T12:00:00.000Z',
        }),
        item({ label: 'Charte UI', order_index: 1 }),
      ],
      createdAt,
    )
    expect(bottleneck).toEqual({
      label: 'Charte UI',
      owner: 'client',
      since: '2026-07-01T12:00:00.000Z',
    })
  })

  it('signale une étape en attente de validation agence', () => {
    const bottleneck = findProjectBottleneck(
      [
        item({
          label: 'Brief',
          order_index: 0,
          completed: true,
          review_status: 'pending',
          submitted_at: '2026-07-02T08:00:00.000Z',
        }),
      ],
      createdAt,
    )
    expect(bottleneck).toEqual({
      label: 'Brief',
      owner: 'agency',
      since: '2026-07-02T08:00:00.000Z',
    })
  })

  it('signale une correction demandée côté client', () => {
    const bottleneck = findProjectBottleneck(
      [
        item({
          label: 'Logo',
          order_index: 0,
          type: 'file',
          completed: false,
          review_status: 'rejected',
          submitted_at: '2026-07-02T08:00:00.000Z',
          reviewed_at: '2026-07-03T09:00:00.000Z',
        }),
      ],
      createdAt,
    )
    expect(bottleneck?.owner).toBe('client')
    expect(bottleneck?.since).toBe('2026-07-03T09:00:00.000Z')
  })

  it('ignore les étapes masquées par une condition', () => {
    const bottleneck = findProjectBottleneck(
      [
        item({
          label: 'Formule',
          order_index: 0,
          type: 'choice',
          completed: true,
          value: 'Solo',
          review_status: 'approved',
          submitted_at: '2026-07-01T11:00:00.000Z',
        }),
        item({
          label: 'Kbis',
          order_index: 1,
          type: 'file',
          config: { visibleWhen: { sourceIndex: 0, equals: 'Société' } },
        }),
        item({ label: 'RDV', order_index: 2, type: 'schedule' }),
      ],
      createdAt,
    )
    expect(bottleneck?.label).toBe('RDV')
  })

  it('renvoie null si tout est réglé', () => {
    expect(
      findProjectBottleneck(
        [
          item({
            label: 'Brief',
            order_index: 0,
            completed: true,
            review_status: 'approved',
          }),
        ],
        createdAt,
      ),
    ).toBeNull()
  })
})

describe('formatBottleneck*', () => {
  const now = new Date('2026-07-05T10:00:00.000Z').getTime()

  it('formate l’âge et le libellé', () => {
    expect(formatBottleneckAge('2026-07-02T10:00:00.000Z', now)).toBe('3 j')
    expect(
      formatBottleneckLabel(
        { label: 'Charte UI', owner: 'client', since: '2026-07-02T10:00:00.000Z' },
        now,
      ),
    ).toBe('Bloqué : Charte UI · 3 j')
    expect(
      formatBottleneckLabel(
        { label: 'Brief', owner: 'agency', since: '2026-07-05T08:00:00.000Z' },
        now,
      ),
    ).toBe('À valider : Brief · 2 h')
  })

  it('détecte un blocage > 48 h', () => {
    expect(
      isBottleneckStale(
        { label: 'X', owner: 'client', since: '2026-07-02T10:00:00.000Z' },
        now,
      ),
    ).toBe(true)
    expect(
      isBottleneckStale(
        { label: 'X', owner: 'client', since: '2026-07-05T08:00:00.000Z' },
        now,
      ),
    ).toBe(false)
  })
})
