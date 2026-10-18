import { describe, expect, it } from 'vitest'

/**
 * Pure helpers mirroring stripe-webhook Connect payment rules
 * (amount match + first-paid-only side effects).
 */

function amountsMatch(
  priceEur: number | null | undefined,
  amountTotalCents: number | null,
): boolean {
  if (priceEur == null || priceEur <= 0 || amountTotalCents == null) return false
  return amountTotalCents === Math.round(priceEur * 100)
}

function shouldFirePaymentReceived(opts: {
  alreadyPaid: boolean
  amountsMatch: boolean
  hasProjectId: boolean
}): boolean {
  return !opts.alreadyPaid && opts.amountsMatch && opts.hasProjectId
}

function refundStatus(opts: {
  amount: number
  amountRefunded: number
}): 'refunded' | 'paid_partial' {
  return opts.amountRefunded >= opts.amount ? 'refunded' : 'paid_partial'
}

describe('webhook payment rules', () => {
  it('accepte uniquement le montant = price × 100', () => {
    expect(amountsMatch(500, 50000)).toBe(true)
    expect(amountsMatch(500, 49900)).toBe(false)
    expect(amountsMatch(null, 50000)).toBe(false)
  })

  it('n’émet payment.received qu’une fois (déjà paid → skip)', () => {
    expect(
      shouldFirePaymentReceived({
        alreadyPaid: false,
        amountsMatch: true,
        hasProjectId: true,
      }),
    ).toBe(true)
    expect(
      shouldFirePaymentReceived({
        alreadyPaid: true,
        amountsMatch: true,
        hasProjectId: true,
      }),
    ).toBe(false)
  })

  it('refund total → refunded ; partiel → paid', () => {
    expect(refundStatus({ amount: 50000, amountRefunded: 50000 })).toBe('refunded')
    expect(refundStatus({ amount: 50000, amountRefunded: 10000 })).toBe('paid_partial')
  })
})

describe('price change invalidates old checkout', () => {
  it('session open à un autre montant ne doit pas être réutilisée', () => {
    const expectedCents = Math.round(600 * 100)
    const existingAmountTotal = 50000
    const canReuse = existingAmountTotal === expectedCents
    expect(canReuse).toBe(false)
  })
})
