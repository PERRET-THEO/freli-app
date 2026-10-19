import { supabase } from './supabase'
import { edgeFunctionErrorMessage, readEdgeFunctionError } from './edgeFunctionError'

export type PaymentLinkResult = {
  checkoutUrl: string
  emailSent: boolean
}

/** Génère (ou réutilise) un lien de paiement Stripe et l'envoie au client par email. */
export async function sendPaymentLink(
  projectId: string,
  sendEmail = true,
): Promise<PaymentLinkResult> {
  const { data, error } = await supabase.functions.invoke('stripe-payment-link', {
    body: { projectId, sendEmail },
  })
  if (error) {
    const parsed = await readEdgeFunctionError(error, data)
    throw new Error(edgeFunctionErrorMessage(parsed))
  }
  if (data?.error) throw new Error(String(data.message ?? data.error))
  return { checkoutUrl: data.checkoutUrl, emailSent: Boolean(data.emailSent) }
}
