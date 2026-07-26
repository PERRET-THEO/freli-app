import { supabase } from './supabase'

type PortalPaymentLinkResult = {
  checkoutUrl: string | null
  alreadyPaid: boolean
}

/** Lien Stripe pour une étape « Paiement » du parcours, côté portail client. */
export async function requestPortalPaymentLink(
  projectToken: string,
): Promise<PortalPaymentLinkResult> {
  const { data, error } = await supabase.functions.invoke('portal-payment-link', {
    body: { projectToken },
  })
  if (error) throw new Error(error.message)

  const payload = data as
    | { checkoutUrl?: string | null; alreadyPaid?: boolean; error?: string }
    | null
  if (payload?.error) throw new Error(payload.error)

  return {
    checkoutUrl: payload?.checkoutUrl ?? null,
    alreadyPaid: payload?.alreadyPaid === true,
  }
}
