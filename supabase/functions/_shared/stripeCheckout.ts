import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

export type CheckoutProject = {
  id: string
  client_name: string
  client_email: string | null
  token: string
  price: number | null
  payment_status: string | null
  stripe_checkout_url?: string | null
  stripe_checkout_session_id?: string | null
}

export type StripeConnectInfo = { accountId: string; currency: string }

/** Renvoie les infos Connect si le compte est prêt à encaisser, sinon null. */
export function stripeConnectReady(config: Record<string, unknown>): StripeConnectInfo | null {
  const accountId =
    typeof config.stripe_connect_account_id === 'string' ? config.stripe_connect_account_id : ''
  const charges = config.charges_enabled === true
  if (!accountId.startsWith('acct_') || !charges) return null
  const currency = typeof config.currency === 'string' ? config.currency : 'eur'
  return { accountId, currency }
}

/** Normalise le prix projet en nombre d'euros valide (> 0) ou null. */
export function parsePrice(rawPrice: number | string | null | undefined): number | null {
  const price = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : Number(rawPrice ?? 0)
  if (!price || price <= 0 || !Number.isFinite(price)) return null
  return price
}

async function fetchSessionStatus(
  sessionId: string,
  accountId: string,
): Promise<{ status: string; url: string | null } | null> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Stripe-Account': accountId,
        'Stripe-Version': '2025-04-30.basil',
      },
    })
    if (!res.ok) return null
    const session = await res.json()
    return { status: String(session.status ?? ''), url: (session.url as string | null) ?? null }
  } catch (e) {
    console.error('fetchSessionStatus error:', (e as Error).message)
    return null
  }
}

/**
 * Crée (ou réutilise) une session Stripe Checkout pour un projet.
 * Idempotent : ne recrée pas de session si le projet est payé, sans prix,
 * Stripe non prêt, ou si une session existante est toujours ouverte.
 * Persiste l'URL et l'id de session sur `projects`.
 */
export async function ensureCheckoutSession(
  project: CheckoutProject,
  connect: StripeConnectInfo,
): Promise<{ checkoutUrl: string } | null> {
  if (!stripeSecretKey) {
    console.warn('STRIPE_SECRET_KEY not set, skipping checkout')
    return null
  }
  if (project.payment_status === 'paid') return null

  const price = parsePrice(project.price)
  if (!price) return null

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  if (project.stripe_checkout_session_id) {
    const existing = await fetchSessionStatus(project.stripe_checkout_session_id, connect.accountId)
    if (existing?.status === 'open' && existing.url) {
      return { checkoutUrl: existing.url }
    }
  }

  const params = new URLSearchParams()
  params.append('mode', 'payment')
  params.append('success_url', `${appUrl}/p/${project.token}?payment=success`)
  params.append('cancel_url', `${appUrl}/p/${project.token}?payment=cancelled`)
  params.append('line_items[0][price_data][currency]', connect.currency)
  params.append('line_items[0][price_data][unit_amount]', String(Math.round(price * 100)))
  params.append('line_items[0][price_data][product_data][name]', `Onboarding — ${project.client_name}`)
  params.append('line_items[0][quantity]', '1')
  params.append('client_reference_id', project.id)
  params.append('metadata[project_id]', project.id)
  if (project.client_email) {
    params.append('customer_email', project.client_email)
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': connect.accountId,
      'Stripe-Version': '2025-04-30.basil',
    },
    body: params.toString(),
  })

  const session = await response.json()
  if (!response.ok) {
    throw new Error(`Stripe error: ${session.error?.message ?? JSON.stringify(session)}`)
  }

  const checkoutUrl = session.url as string | null
  if (!checkoutUrl) {
    console.error('Stripe session missing url:', JSON.stringify(session))
    throw new Error('Stripe Checkout session has no url')
  }

  await supabase
    .from('projects')
    .update({
      stripe_checkout_url: checkoutUrl,
      stripe_checkout_session_id: session.id,
    })
    .eq('id', project.id)

  console.log('Stripe checkout session created:', session.id)
  return { checkoutUrl }
}
