import { supabase } from './supabase'

export type UpdateProjectPriceResult = {
  projectId: string
  price: number
  oldPrice: number | null
  changed: boolean
  hadCheckoutSession: boolean
  hadPaymentEmail: boolean
}

export async function updateProjectPrice(
  projectId: string,
  priceEur: number,
): Promise<UpdateProjectPriceResult> {
  const { data, error } = await supabase.rpc('update_project_price', {
    p_project_id: projectId,
    p_price: priceEur,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('price_locked_after_payment')) {
      throw new Error('Montant verrouillé après paiement')
    }
    if (msg.includes('invalid_price')) {
      throw new Error('Montant invalide (doit être > 0, max 2 décimales).')
    }
    if (msg.includes('forbidden_agency')) {
      throw new Error('Accès refusé à ce projet.')
    }
    throw new Error(error.message)
  }

  const payload = data as {
    project_id?: string
    price?: number
    old_price?: number | null
    changed?: boolean
    had_checkout_session?: boolean
    had_payment_email?: boolean
  }

  return {
    projectId: String(payload.project_id ?? projectId),
    price: Number(payload.price),
    oldPrice: payload.old_price == null ? null : Number(payload.old_price),
    changed: payload.changed === true,
    hadCheckoutSession: payload.had_checkout_session === true,
    hadPaymentEmail: payload.had_payment_email === true,
  }
}
