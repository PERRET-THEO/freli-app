import { supabase } from './supabase'

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
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  return { checkoutUrl: data.checkoutUrl, emailSent: Boolean(data.emailSent) }
}
