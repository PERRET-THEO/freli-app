/**
 * Server-side payment unlock (mirrors src/lib/payments.ts).
 *
 * Unlock uses checklist item `completed` (client submit / contract signed),
 * NOT agency review_status. Once payment_unlocked_at is set, do not re-lock.
 */

export type PaymentUnlockMode = 'after_prerequisites' | 'immediate'

export type UnlockChecklistItem = {
  type: string
  completed: boolean
  required?: boolean | null
  order_index: number
}

export type PaymentUnlockResult = {
  unlocked: boolean
  sticky: boolean
  prerequisitesMet: boolean
  lockReason: 'contract' | 'steps' | null
  lockMessage: string | null
}

export function parseUnlockMode(raw: string | null | undefined): PaymentUnlockMode {
  return raw === 'immediate' ? 'immediate' : 'after_prerequisites'
}

export function evaluatePaymentUnlock(input: {
  unlockMode: string | null | undefined
  paymentUnlockedAt: string | null | undefined
  items: UnlockChecklistItem[]
}): PaymentUnlockResult {
  const mode = parseUnlockMode(input.unlockMode)
  const sticky = Boolean(input.paymentUnlockedAt)
  const sorted = [...input.items].sort((a, b) => a.order_index - b.order_index)

  if (mode === 'immediate') {
    return {
      unlocked: true,
      sticky,
      prerequisitesMet: true,
      lockReason: null,
      lockMessage: null,
    }
  }

  const paymentIndex = sorted.findIndex((item) => item.type === 'payment')
  const preceding = paymentIndex >= 0 ? sorted.slice(0, paymentIndex) : sorted
  const blocking = preceding.filter(
    (item) => item.required !== false && !item.completed,
  )
  const prerequisitesMet = blocking.length === 0
  const unlocked = sticky || prerequisitesMet

  if (unlocked) {
    return {
      unlocked: true,
      sticky,
      prerequisitesMet,
      lockReason: null,
      lockMessage: null,
    }
  }

  const hasUnsignedContract = blocking.some((item) => item.type === 'signature')
  if (hasUnsignedContract) {
    return {
      unlocked: false,
      sticky,
      prerequisitesMet: false,
      lockReason: 'contract',
      lockMessage: 'Disponible après la signature du contrat',
    }
  }

  const numbers = blocking.map((item) => {
    const idx = sorted.findIndex((c) => c.order_index === item.order_index)
    return idx >= 0 ? idx + 1 : item.order_index + 1
  })
  const label =
    numbers.length === 1
      ? String(numbers[0])
      : `${Math.min(...numbers)} à ${Math.max(...numbers)}`

  return {
    unlocked: false,
    sticky,
    prerequisitesMet: false,
    lockReason: 'steps',
    lockMessage: `Disponible après les étapes ${label}`,
  }
}

/** Stamp payment_unlocked_at once when unlock is acquired. */
export async function stampPaymentUnlockedAt(
  // deno-lint-ignore no-explicit-any
  supabase: { from: (table: string) => any },
  projectId: string,
  alreadySet: string | null | undefined,
): Promise<string | null> {
  if (alreadySet) return alreadySet
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('projects')
    .update({ payment_unlocked_at: now })
    .eq('id', projectId)
    .is('payment_unlocked_at', null)
  if (error) {
    console.error('stampPaymentUnlockedAt:', error.message)
    return null
  }
  return now
}
