import { describe, expect, it } from 'vitest'
import { getClientPendingActions } from './clientPendingActions.ts'

function item(
  overrides: Partial<{
    label: string
    type: string
    completed: boolean
    value: string | null
    order_index: number
    review_status: 'pending' | 'approved' | 'rejected' | null
    review_note: string | null
    config: null
  }> = {},
) {
  return {
    label: 'Étape',
    type: 'text',
    completed: false,
    value: null,
    order_index: 0,
    review_status: null as 'pending' | 'approved' | 'rejected' | null,
    review_note: null,
    config: null,
    ...overrides,
  }
}

describe('getClientPendingActions', () => {
  it('cas mixte : Brief à valider + Charte non envoyée → relance sur Charte uniquement', () => {
    const actions = getClientPendingActions([
      item({
        label: 'Brief technique',
        order_index: 0,
        completed: true,
        review_status: 'pending',
      }),
      item({
        label: 'Charte UI',
        order_index: 1,
        completed: false,
      }),
      item({
        label: 'Logo',
        order_index: 2,
        completed: true,
        review_status: 'pending',
      }),
    ])
    expect(actions.map((a) => a.label)).toEqual(['Charte UI'])
  })

  it('inclut les corrections rejected', () => {
    const actions = getClientPendingActions([
      item({
        label: 'Identité',
        completed: false,
        review_status: 'rejected',
        review_note: 'Photo floue',
      }),
    ])
    expect(actions).toHaveLength(1)
    expect(actions[0].label).toBe('Identité')
  })

  it('ne retourne rien si tout est à valider côté agence', () => {
    const actions = getClientPendingActions([
      item({ label: 'A', completed: true, review_status: 'pending', order_index: 0 }),
      item({ label: 'B', completed: true, review_status: 'pending', order_index: 1 }),
    ])
    expect(actions).toHaveLength(0)
  })
})
