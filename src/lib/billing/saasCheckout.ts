import { supabase } from '../supabase'
import type { BillingInterval } from './entitlements'

export type VerifySaasCheckoutResult = {
  ok: true
  paid: boolean
  email: string
  interval: BillingInterval
  existingUser: boolean
  sessionStatus: string | null
  paymentStatus: string | null
}

async function invokeJson<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    return { data: null, error: error.message }
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { data: null, error: String((data as { error: unknown }).error) }
  }
  return { data: data as T, error: null }
}

export async function createSaasCheckout(args: {
  interval: BillingInterval
  source: 'pricing' | 'admin'
  email?: string
  includeAi?: boolean
}): Promise<{ checkoutUrl: string } | { error: string }> {
  const { data, error } = await invokeJson<{ checkoutUrl?: string }>(
    'create-saas-checkout',
    args,
  )
  if (error) return { error }
  if (!data?.checkoutUrl) return { error: 'URL Checkout manquante' }
  return { checkoutUrl: data.checkoutUrl }
}

export async function verifySaasCheckout(
  sessionId: string,
): Promise<VerifySaasCheckoutResult | { error: string }> {
  const { data, error } = await invokeJson<VerifySaasCheckoutResult>('verify-saas-checkout', {
    sessionId,
  })
  if (error) return { error }
  if (!data?.ok) return { error: 'Vérification Checkout impossible' }
  return data
}

export async function completeSaasSignup(args: {
  sessionId: string
  password?: string
  agencyName?: string
  linkOnly?: boolean
}): Promise<
  | { ok: true; alreadyRegistered: boolean; email: string }
  | { error: string }
> {
  const { data, error } = await invokeJson<{
    ok?: boolean
    alreadyRegistered?: boolean
    email?: string
  }>('complete-saas-signup', args)
  if (error) return { error }
  if (!data?.ok || !data.email) return { error: 'Création du compte impossible' }
  return {
    ok: true,
    alreadyRegistered: Boolean(data.alreadyRegistered),
    email: data.email,
  }
}

export type SubscriptionLead = {
  id: string
  email: string
  source: string
  billing_interval: string
  checkout_session_id: string | null
  status: string
  agency_id: string | null
  created_at: string
  updated_at: string
}

export async function listSubscriptionLeads(): Promise<
  { leads: SubscriptionLead[] } | { error: string }
> {
  const { data, error } = await invokeJson<{ leads?: SubscriptionLead[] }>(
    'list-subscription-leads',
    {},
  )
  if (error) return { error }
  return { leads: data?.leads ?? [] }
}

export async function resendSubscriptionInvite(args: {
  leadId?: string
  email?: string
}): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await invokeJson<{ ok?: boolean }>('resend-subscription-invite', args)
  if (error) return { error }
  if (!data?.ok) return { error: 'Envoi invitation impossible' }
  return { ok: true }
}

export async function fetchBillingAccount(agencyId: string): Promise<{
  status: string | null
  billing_interval: string | null
  ai_addon_active: boolean
  current_period_end: string | null
  hasRow: boolean
} | null> {
  const { data, error } = await supabase
    .from('billing_accounts')
    .select('status, billing_interval, ai_addon_active, current_period_end')
    .eq('agency_id', agencyId)
    .maybeSingle()

  if (error) {
    console.warn('fetchBillingAccount:', error.message)
    return null
  }
  if (!data) {
    return {
      status: null,
      billing_interval: null,
      ai_addon_active: false,
      current_period_end: null,
      hasRow: false,
    }
  }
  return {
    status: data.status ?? null,
    billing_interval: data.billing_interval ?? null,
    ai_addon_active: Boolean(data.ai_addon_active),
    current_period_end: data.current_period_end ?? null,
    hasRow: true,
  }
}
