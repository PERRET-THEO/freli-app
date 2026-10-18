import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { formatEuro } from './formatEuro.ts'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

/** sk_test_… vs sk_live_… — must match session prefix (cs_test_ / cs_live_). */
export function stripeSecretMode(): 'test' | 'live' | 'unknown' {
  if (stripeSecretKey.startsWith('sk_test_')) return 'test'
  if (stripeSecretKey.startsWith('sk_live_')) return 'live'
  return 'unknown'
}

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

/** Normalise le prix projet en euros (> 0, 2 décimales) ou null. */
export function parsePrice(rawPrice: number | string | null | undefined): number | null {
  const price =
    typeof rawPrice === 'string' ? Number.parseFloat(rawPrice.replace(',', '.')) : Number(rawPrice ?? 0)
  if (!price || price <= 0 || !Number.isFinite(price)) return null
  return Math.round(price * 100) / 100
}

export async function fetchSessionStatus(
  sessionId: string,
  accountId: string,
): Promise<{ status: string; url: string | null; amountTotal: number | null } | null> {
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
    return {
      status: String(session.status ?? ''),
      url: (session.url as string | null) ?? null,
      amountTotal: typeof session.amount_total === 'number' ? session.amount_total : null,
    }
  } catch (e) {
    console.error('fetchSessionStatus error:', (e as Error).message)
    return null
  }
}

export type ExpireCheckoutResult = {
  ok: true
  status: 'expired' | 'already_expired' | 'complete' | 'skipped'
} | {
  ok: false
  error: string
}

/**
 * Expire a Checkout Session on a Connect account.
 * Uses Stripe-Account header (required for cs_* created on Express accounts).
 * Treats already expired / complete as success (no retry).
 */
export async function expireCheckoutSessionOnConnect(
  sessionId: string,
  stripeAccountId: string,
): Promise<ExpireCheckoutResult> {
  if (!stripeSecretKey) {
    return { ok: false, error: 'STRIPE_SECRET_KEY not set' }
  }
  if (!sessionId.startsWith('cs_')) {
    return { ok: false, error: `invalid session id: ${sessionId}` }
  }
  if (!stripeAccountId.startsWith('acct_')) {
    return { ok: false, error: `invalid stripe account: ${stripeAccountId}` }
  }

  const keyMode = stripeSecretMode()
  const sessionMode = sessionId.startsWith('cs_live_')
    ? 'live'
    : sessionId.startsWith('cs_test_')
      ? 'test'
      : 'unknown'
  if (keyMode !== 'unknown' && sessionMode !== 'unknown' && keyMode !== sessionMode) {
    return {
      ok: false,
      error: `Stripe mode mismatch: key=${keyMode} session=${sessionMode} (${sessionId})`,
    }
  }

  const existing = await fetchSessionStatus(sessionId, stripeAccountId)
  if (existing?.status === 'expired') {
    return { ok: true, status: 'already_expired' }
  }
  if (existing?.status === 'complete') {
    return { ok: true, status: 'complete' }
  }

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/expire`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Stripe-Account': stripeAccountId,
      'Stripe-Version': '2025-04-30.basil',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  if (res.ok) {
    return { ok: true, status: 'expired' }
  }

  const body = await res.json().catch(() => ({})) as {
    error?: { message?: string; code?: string }
  }
  const message = body.error?.message ?? `HTTP ${res.status}`
  // Session already not open — treat as done.
  if (
    /expired|complete|no longer open|cannot expire/i.test(message) ||
    body.error?.code === 'checkout_session_already_expired'
  ) {
    return { ok: true, status: 'already_expired' }
  }
  return { ok: false, error: message }
}

/** Expire une session Checkout ouverte sur le compte Connect et vide les colonnes projet. */
export async function expireProjectCheckoutSession(
  project: Pick<CheckoutProject, 'id' | 'stripe_checkout_session_id' | 'payment_status'>,
  connect: StripeConnectInfo,
): Promise<void> {
  if (project.payment_status === 'paid') return
  const sessionId = project.stripe_checkout_session_id
  if (sessionId) {
    const result = await expireCheckoutSessionOnConnect(sessionId, connect.accountId)
    if (!result.ok) {
      throw new Error(result.error)
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  await supabase
    .from('projects')
    .update({ stripe_checkout_url: null, stripe_checkout_session_id: null })
    .eq('id', project.id)
    .neq('payment_status', 'paid')
}

/**
 * Crée (ou réutilise) une session Stripe Checkout pour un projet.
 * Idempotent : ne recrée pas de session si le projet est payé, sans prix,
 * Stripe non prêt, ou si une session existante est toujours ouverte au même montant.
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
  const expectedCents = Math.round(price * 100)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  if (project.stripe_checkout_session_id) {
    const existing = await fetchSessionStatus(project.stripe_checkout_session_id, connect.accountId)
    if (
      existing?.status === 'open' &&
      existing.url &&
      existing.amountTotal === expectedCents
    ) {
      return { checkoutUrl: existing.url }
    }
    // Price changed or session stale: expire before letting a new amount through.
    if (existing?.status === 'open') {
      await expireProjectCheckoutSession(project, connect)
    }
  }

  const params = new URLSearchParams()
  params.append('mode', 'payment')
  params.append('success_url', `${appUrl}/p/${project.token}?payment=success`)
  params.append('cancel_url', `${appUrl}/p/${project.token}?payment=cancelled`)
  params.append('line_items[0][price_data][currency]', connect.currency)
  params.append('line_items[0][price_data][unit_amount]', String(expectedCents))
  params.append('line_items[0][price_data][product_data][name]', `Onboarding — ${project.client_name}`)
  params.append(
    'line_items[0][price_data][product_data][description]',
    `Montant : ${formatEuro(project.price)}`,
  )
  params.append('line_items[0][quantity]', '1')
  params.append('client_reference_id', project.id)
  params.append('metadata[project_id]', project.id)
  params.append('metadata[expected_amount_cents]', String(expectedCents))
  params.append('payment_intent_data[metadata][project_id]', project.id)
  params.append('payment_intent_data[metadata][expected_amount_cents]', String(expectedCents))
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
      // New attempt after a failure clears the failed badge.
      ...(project.payment_status === 'failed' ? { payment_status: 'pending' } : {}),
    })
    .eq('id', project.id)

  console.log(
    'Stripe checkout session created:',
    session.id,
    'mode=',
    stripeSecretMode(),
    'account=',
    connect.accountId,
  )
  return { checkoutUrl }
}
