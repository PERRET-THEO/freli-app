import { supabase } from './supabase'

/** Ouvre l'espace Stripe Express (solde, virements, IBAN) dans un nouvel onglet. */
export async function openStripeExpressDashboard(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-dashboard', {
    body: {},
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))

  const url = data?.url as string | undefined
  if (!url) throw new Error('Lien Stripe indisponible')

  window.open(url, '_blank', 'noopener,noreferrer')
}
