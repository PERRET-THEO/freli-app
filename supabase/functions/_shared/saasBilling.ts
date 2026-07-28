import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { createAuthAdminClient, sendUserInviteEmail } from './authInviteEmail.ts'

export const STRIPE_API_VERSION = '2025-04-30.basil'

export type BillingInterval = 'month' | 'year'
export type CheckoutSource = 'pricing' | 'admin'

export function getStripeSecret(): string {
  return Deno.env.get('STRIPE_SECRET_KEY') ?? ''
}

export function getAppUrl(): string {
  return (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')
}

export function priceIdForInterval(interval: BillingInterval): string {
  const monthly = Deno.env.get('STRIPE_PRICE_MONTHLY') ?? ''
  const yearly = Deno.env.get('STRIPE_PRICE_YEARLY') ?? ''
  const id = interval === 'year' ? yearly : monthly
  return id.trim()
}

export function aiPriceIdForInterval(interval: BillingInterval): string {
  const monthly = Deno.env.get('STRIPE_PRICE_AI_MONTHLY') ?? ''
  const yearly = Deno.env.get('STRIPE_PRICE_AI_YEARLY') ?? ''
  const id = interval === 'year' ? yearly : monthly
  return id.trim()
}

/** lookup_keys figés (créés par bootstrap-saas-prices) — fallback si secrets absents. */
export function subscriptionLookupKey(interval: BillingInterval): string {
  return interval === 'year' ? 'freli_subscription_year' : 'freli_subscription_month'
}

export function aiLookupKey(interval: BillingInterval): string {
  return interval === 'year' ? 'freli_ai_year' : 'freli_ai_month'
}

export async function priceIdByLookupKey(lookupKey: string): Promise<string> {
  const res = await stripeGet(
    `prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`,
  )
  if (!res.ok) return ''
  const data = res.json.data as Array<{ id?: string }> | undefined
  const id = data?.[0]?.id
  return typeof id === 'string' ? id.trim() : ''
}

/** Secret env → table billing_stripe_prices → lookup_key Stripe. */
export async function resolveSubscriptionPriceId(interval: BillingInterval): Promise<string> {
  const fromEnv = priceIdForInterval(interval)
  if (fromEnv) return fromEnv
  const key = interval === 'year' ? 'STRIPE_PRICE_YEARLY' : 'STRIPE_PRICE_MONTHLY'
  const fromDb = await priceIdFromDb(key)
  if (fromDb) return fromDb
  return priceIdByLookupKey(subscriptionLookupKey(interval))
}

export async function resolveAiPriceId(interval: BillingInterval): Promise<string> {
  const fromEnv = aiPriceIdForInterval(interval)
  if (fromEnv) return fromEnv
  const key = interval === 'year' ? 'STRIPE_PRICE_AI_YEARLY' : 'STRIPE_PRICE_AI_MONTHLY'
  const fromDb = await priceIdFromDb(key)
  if (fromDb) return fromDb
  return priceIdByLookupKey(aiLookupKey(interval))
}

async function priceIdFromDb(key: string): Promise<string> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('billing_stripe_prices')
      .select('price_id')
      .eq('key', key)
      .maybeSingle()
    if (error || !data?.price_id) return ''
    return String(data.price_id).trim()
  } catch {
    return ''
  }
}

export function parseInterval(raw: unknown): BillingInterval | null {
  if (raw === 'month' || raw === 'year') return raw
  return null
}

export function parseSource(raw: unknown): CheckoutSource | null {
  if (raw === 'pricing' || raw === 'admin') return raw
  return null
}

export function isInviteAdminEmail(email: string | undefined | null): boolean {
  const adminEmails = (Deno.env.get('INVITE_ADMIN_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const caller = (email ?? '').trim().toLowerCase()
  return Boolean(adminEmails.length && caller && adminEmails.includes(caller))
}

export async function stripeFormPost(
  path: string,
  params: URLSearchParams,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const secret = getStripeSecret()
  if (!secret) return { ok: false, status: 500, error: 'STRIPE_SECRET_KEY is not configured' }

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_API_VERSION,
    },
    body: params.toString(),
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined
    return { ok: false, status: res.status, error: errObj?.message ?? 'Stripe request failed' }
  }
  return { ok: true, json }
}

export async function stripeGet(
  path: string,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const secret = getStripeSecret()
  if (!secret) return { ok: false, status: 500, error: 'STRIPE_SECRET_KEY is not configured' }

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': STRIPE_API_VERSION,
    },
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined
    return { ok: false, status: res.status, error: errObj?.message ?? 'Stripe request failed' }
  }
  return { ok: true, json }
}

export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createClient(supabaseUrl, serviceRoleKey)
}

export function isSaasCheckoutSession(session: Record<string, unknown>): boolean {
  const meta = session.metadata as Record<string, unknown> | undefined
  return meta?.freli_saas === '1' || meta?.freli_saas === 1
}

export function sessionCustomerEmail(session: Record<string, unknown>): string {
  const direct =
    typeof session.customer_email === 'string' ? session.customer_email.trim().toLowerCase() : ''
  if (direct) return direct
  const details = session.customer_details as { email?: string } | undefined
  if (typeof details?.email === 'string') return details.email.trim().toLowerCase()
  return ''
}

export function sessionIsPaid(session: Record<string, unknown>): boolean {
  const paymentStatus = typeof session.payment_status === 'string' ? session.payment_status : ''
  const status = typeof session.status === 'string' ? session.status : ''
  // Subscription checkout: payment_status paid OR no_payment_required; status complete
  if (status === 'complete' && (paymentStatus === 'paid' || paymentStatus === 'no_payment_required')) {
    return true
  }
  return paymentStatus === 'paid'
}

export async function upsertLeadPaid(
  supabase: SupabaseClient,
  args: {
    email: string
    sessionId: string
    customerId: string | null
    subscriptionId: string | null
    interval: BillingInterval
    source: CheckoutSource
  },
): Promise<string | null> {
  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from('subscription_leads')
    .select('id, status')
    .eq('checkout_session_id', args.sessionId)
    .maybeSingle()

  if (existing?.id) {
    const nextStatus =
      existing.status === 'account_linked' || existing.status === 'invite_sent'
        ? existing.status
        : 'paid'
    await supabase
      .from('subscription_leads')
      .update({
        email: args.email,
        stripe_customer_id: args.customerId,
        stripe_subscription_id: args.subscriptionId,
        billing_interval: args.interval,
        status: nextStatus,
        updated_at: now,
      })
      .eq('id', existing.id)
    return existing.id
  }

  const { data: inserted, error } = await supabase
    .from('subscription_leads')
    .insert({
      email: args.email,
      source: args.source,
      billing_interval: args.interval,
      checkout_session_id: args.sessionId,
      stripe_customer_id: args.customerId,
      stripe_subscription_id: args.subscriptionId,
      status: 'paid',
      updated_at: now,
    })
    .select('id')
    .single()

  if (error) {
    console.error('upsertLeadPaid insert:', error.message)
    return null
  }
  return inserted?.id ?? null
}

export async function sendSaasInviteIfNeeded(
  supabase: SupabaseClient,
  email: string,
  leadId: string | null,
): Promise<void> {
  const resend = new Resend(Deno.env.get('RESEND_API_KEY') ?? '')
  const authAdmin = createAuthAdminClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const result = await sendUserInviteEmail(authAdmin, resend, email, getAppUrl())
  if (!result.ok) {
    // 409 = déjà inscrit — normal si signup self-serve déjà terminé
    if (result.status !== 409) {
      console.error('sendSaasInviteIfNeeded:', result.error)
    }
    return
  }
  if (leadId) {
    await supabase
      .from('subscription_leads')
      .update({ status: 'invite_sent', updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .in('status', ['paid', 'invite_sent'])
  }
}

export async function linkBillingToAgency(
  supabase: SupabaseClient,
  args: {
    agencyId: string
    email: string
    customerId: string | null
    subscriptionId: string | null
    interval: BillingInterval
    status?: string
    currentPeriodEnd?: string | null
    checkoutSessionId?: string | null
    aiAddonActive?: boolean
  },
): Promise<void> {
  const now = new Date().toISOString()
  const status = args.status === 'active' || args.status === 'past_due' || args.status === 'canceled'
    ? args.status
    : 'active'
  const aiAddonActive = args.aiAddonActive === true

  const { error } = await supabase.from('billing_accounts').upsert(
    {
      agency_id: args.agencyId,
      stripe_customer_id: args.customerId,
      stripe_subscription_id: args.subscriptionId,
      billing_interval: args.interval,
      status,
      ai_addon_active: aiAddonActive,
      current_period_end: args.currentPeriodEnd ?? null,
      updated_at: now,
    },
    { onConflict: 'agency_id' },
  )
  if (error) throw new Error(error.message)

  await supabase.from('agencies').update({ plan: 'freli' }).eq('id', args.agencyId)

  if (aiAddonActive) {
    await supabase
      .from('agencies')
      .update({
        ai_extraction_enabled: true,
        ai_reminders_enabled: true,
        ai_contracts_enabled: true,
      })
      .eq('id', args.agencyId)
  }

  const leadUpdate = {
    agency_id: args.agencyId,
    email: args.email,
    status: 'account_linked',
    updated_at: now,
  }
  if (args.checkoutSessionId) {
    await supabase
      .from('subscription_leads')
      .update(leadUpdate)
      .eq('checkout_session_id', args.checkoutSessionId)
  } else {
    await supabase
      .from('subscription_leads')
      .update(leadUpdate)
      .eq('email', args.email)
      .in('status', ['paid', 'invite_sent', 'checkout_created', 'account_linked'])
  }
}

/** Résout un user Auth existant sans lister tous les users (generateLink recovery). */
export async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
  })
  if (error || !data?.user?.id) return null
  return data.user.id
}
