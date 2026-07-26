import { describe, expect, it } from 'vitest'
import {
  countAwaitingReview,
  countRejected,
  getReviewBadgeLabel,
  getReviewSummary,
  isAwaitingReview,
  isOnboardingSettled,
  isRejected,
  isReviewableType,
  type ReviewableItem,
  type ReviewStatus,
} from './checklistReview'

function item(overrides: Partial<ReviewableItem> = {}): ReviewableItem {
  return {
    id: crypto.randomUUID(),
    label: 'Brief',
    type: 'text',
    completed: true,
    review_status: 'pending',
    review_note: null,
    ...overrides,
  }
}

describe('isReviewableType', () => {
  it('exclut les contrats et les paiements', () => {
    expect(isReviewableType('signature')).toBe(false)
    expect(isReviewableType('payment')).toBe(false)
  })

  it('inclut les saisies et dépôts client', () => {
    expect(isReviewableType('text')).toBe(true)
    expect(isReviewableType('file')).toBe(true)
    expect(isReviewableType('email')).toBe(true)
  })
})

describe('isAwaitingReview', () => {
  it('cible les items transmis et non encore arbitrés', () => {
    expect(isAwaitingReview(item())).toBe(true)
  })

  it('ignore les items non complétés', () => {
    expect(isAwaitingReview(item({ completed: false }))).toBe(false)
  })

  it('ignore les items déjà validés ou refusés', () => {
    expect(isAwaitingReview(item({ review_status: 'approved' }))).toBe(false)
    expect(isAwaitingReview(item({ review_status: 'rejected' }))).toBe(false)
  })

  it('ignore les contrats signés', () => {
    expect(isAwaitingReview(item({ type: 'signature' }))).toBe(false)
  })

  it('traite un review_status absent comme en attente', () => {
    expect(isAwaitingReview(item({ review_status: null }))).toBe(true)
  })
})

describe('countAwaitingReview / countRejected', () => {
  const items = [
    item({ review_status: 'approved' }),
    item({ review_status: 'pending' }),
    item({ review_status: 'pending', type: 'file' }),
    item({ review_status: 'rejected', completed: false }),
    item({ review_status: 'pending', type: 'signature' }),
  ]

  it('compte uniquement les items en attente de revue', () => {
    expect(countAwaitingReview(items)).toBe(2)
  })

  it('compte les items refusés', () => {
    expect(countRejected(items)).toBe(1)
  })
})

describe('getReviewSummary', () => {
  it('agrège les compteurs et signale un état non arbitré', () => {
    const summary = getReviewSummary([
      item({ review_status: 'approved' }),
      item({ review_status: 'pending' }),
    ])
    expect(summary).toMatchObject({ approved: 1, awaitingReview: 1, rejected: 0, settled: false })
  })

  it('marque settled quand tout est validé', () => {
    const summary = getReviewSummary([
      item({ review_status: 'approved' }),
      item({ review_status: 'approved', type: 'file' }),
    ])
    expect(summary.settled).toBe(true)
  })

  it('ne compte pas les contrats signés comme en attente de revue', () => {
    const summary = getReviewSummary([item({ type: 'signature', review_status: 'pending' })])
    expect(summary.awaitingReview).toBe(0)
    expect(summary.settled).toBe(true)
  })
})

describe('isOnboardingSettled', () => {
  it('est faux si une étape reste à compléter', () => {
    expect(isOnboardingSettled([item(), item({ completed: false })])).toBe(false)
  })

  it('est faux si une correction est en attente côté client', () => {
    expect(isOnboardingSettled([item({ review_status: 'rejected', completed: false })])).toBe(false)
  })

  it('est vrai quand tout est complété sans refus', () => {
    expect(isOnboardingSettled([item({ review_status: 'approved' }), item()])).toBe(true)
  })

  it('est faux sur une checklist vide', () => {
    expect(isOnboardingSettled([])).toBe(false)
  })
})

describe('getReviewBadgeLabel', () => {
  it('affiche le motif de correction sur une étape rouverte', () => {
    expect(getReviewBadgeLabel(item({ review_status: 'rejected', completed: false }))).toBe(
      'Correction demandée',
    )
  })

  it("n'affiche rien pour une étape simplement en attente du client", () => {
    expect(getReviewBadgeLabel(item({ completed: false, review_status: 'pending' }))).toBeNull()
  })

  it('affiche le statut de revue pour une étape transmise', () => {
    const statuses: ReviewStatus[] = ['pending', 'approved']
    const labels = statuses.map((status) => getReviewBadgeLabel(item({ review_status: status })))
    expect(labels).toEqual(['À valider', 'Validé'])
  })

  it("n'affiche pas de statut de revue sur un contrat", () => {
    expect(getReviewBadgeLabel(item({ type: 'signature' }))).toBeNull()
  })
})

describe('isRejected', () => {
  it('détecte un refus indépendamment de completed', () => {
    expect(isRejected(item({ review_status: 'rejected', completed: false }))).toBe(true)
    expect(isRejected(item({ review_status: 'approved' }))).toBe(false)
  })
})
