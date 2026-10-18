import { describe, expect, it } from 'vitest'
import { formatEuro } from './formatEuro'
import {
  defaultPaymentItemLabel,
  formatPaymentStepCopy,
  getPaymentUnlockInfo,
  parsePriceInput,
  resolvePaymentState,
} from './payments'

const items = (
  rows: { type: string; completed: boolean; required?: boolean; order_index: number }[],
) => rows

describe('getPaymentUnlockInfo', () => {
  it('bloque tant qu’une étape required précédente n’est pas completed', () => {
    const info = getPaymentUnlockInfo({
      unlockMode: 'after_prerequisites',
      items: items([
        { type: 'text', completed: true, order_index: 0 },
        { type: 'signature', completed: false, order_index: 1 },
        { type: 'payment', completed: false, order_index: 2 },
      ]),
    })
    expect(info.unlocked).toBe(false)
    expect(info.lockReason).toBe('contract')
    expect(info.lockMessage).toMatch(/signature du contrat/)
  })

  it('ignore la validation agence : completed suffit', () => {
    const info = getPaymentUnlockInfo({
      unlockMode: 'after_prerequisites',
      items: items([
        { type: 'text', completed: true, order_index: 0 },
        { type: 'signature', completed: true, order_index: 1 },
        { type: 'payment', completed: false, order_index: 2 },
      ]),
    })
    expect(info.unlocked).toBe(true)
    expect(info.prerequisitesMet).toBe(true)
  })

  it('ne reverrouille pas si payment_unlocked_at est posé (correction)', () => {
    const info = getPaymentUnlockInfo({
      unlockMode: 'after_prerequisites',
      paymentUnlockedAt: '2026-10-01T00:00:00Z',
      items: items([
        { type: 'text', completed: false, order_index: 0 },
        { type: 'payment', completed: false, order_index: 1 },
      ]),
    })
    expect(info.unlocked).toBe(true)
    expect(info.sticky).toBe(true)
    expect(info.prerequisitesMet).toBe(false)
  })

  it('mode immediate débloque tout de suite', () => {
    const info = getPaymentUnlockInfo({
      unlockMode: 'immediate',
      items: items([
        { type: 'signature', completed: false, order_index: 0 },
        { type: 'payment', completed: false, order_index: 1 },
      ]),
    })
    expect(info.unlocked).toBe(true)
  })

  it('message étapes 1 à N sans contrat', () => {
    const info = getPaymentUnlockInfo({
      unlockMode: 'after_prerequisites',
      items: items([
        { type: 'text', completed: false, order_index: 0 },
        { type: 'file', completed: false, order_index: 1 },
        { type: 'payment', completed: false, order_index: 2 },
      ]),
    })
    expect(info.lockReason).toBe('steps')
    expect(info.lockMessage).toBe('Disponible après les étapes 1 à 2')
  })
})

describe('resolvePaymentState', () => {
  it('retourne null sans prix', () => {
    expect(resolvePaymentState({ price: null, paymentStatus: 'pending' })).toBeNull()
  })

  it('dérive not_available / available / link_created / link_sent / paid', () => {
    expect(
      resolvePaymentState({
        price: 500,
        paymentStatus: 'pending',
        unlockInfo: { unlocked: false },
      }),
    ).toBe('not_available')

    expect(
      resolvePaymentState({
        price: 500,
        paymentStatus: 'pending',
        unlockInfo: { unlocked: true },
      }),
    ).toBe('available')

    expect(
      resolvePaymentState({
        price: 500,
        paymentStatus: 'pending',
        unlockInfo: { unlocked: true },
        stripeCheckoutUrl: 'https://checkout.stripe.com/c/pay/cs_test',
      }),
    ).toBe('link_created')

    expect(
      resolvePaymentState({
        price: 500,
        paymentStatus: 'pending',
        unlockInfo: { unlocked: true },
        stripeCheckoutUrl: 'https://checkout.stripe.com/c/pay/cs_test',
        lastPaymentEmailSentAt: '2026-10-01T00:00:00Z',
      }),
    ).toBe('link_sent')

    expect(
      resolvePaymentState({
        price: 500,
        paymentStatus: 'paid',
        unlockInfo: { unlocked: false },
      }),
    ).toBe('paid')
  })
})

describe('parsePriceInput', () => {
  it('accepte euros avec 2 décimales max', () => {
    expect(parsePriceInput('450')).toBe(450)
    expect(parsePriceInput('450,50')).toBe(450.5)
    expect(parsePriceInput('450.99')).toBe(450.99)
    expect(parsePriceInput('0')).toBeNull()
    expect(parsePriceInput('450.999')).toBeNull()
  })
})

describe('formatEuro', () => {
  it('formate sans point parasite ni zéros inutiles', () => {
    expect(formatEuro(450)).toMatch(/^450\s€$/)
    expect(formatEuro(450.5)).toMatch(/^450,5\s€$/)
    expect(formatEuro(450.99)).toMatch(/^450,99\s€$/)
    expect(formatEuro(null)).toBe('—')
    expect(formatEuro(undefined)).toBe('—')
  })
})

describe('labels & copy', () => {
  it('libellé défaut Paiement pour full', () => {
    expect(defaultPaymentItemLabel('full')).toBe('Paiement')
    expect(defaultPaymentItemLabel('deposit')).toMatch(/acompte/)
  })

  it('copy sans « pour poursuivre » en dernière étape', () => {
    expect(formatPaymentStepCopy({ price: 500, isLastStep: true })).not.toMatch(
      /poursuivre/,
    )
    expect(formatPaymentStepCopy({ price: 500, isLastStep: false })).toMatch(/poursuivre/)
  })
})
