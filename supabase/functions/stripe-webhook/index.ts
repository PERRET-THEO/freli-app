/**
 * Stripe webhook for Freli SaaS billing + Connect Express project payments.
 *
 * Connect: this endpoint MUST receive events from connected accounts
 * (Dashboard → Webhooks → "Listen to events on Connected accounts", or
 * Stripe CLI `stripe listen --forward-connect-to ...`). Required Connect events:
 * - checkout.session.completed
 * - checkout.session.async_payment_failed
 * - checkout.session.expired
 * - payment_intent.payment_failed
 * - charge.refunded
 * - account.updated
 *
 * Idempotency: stripe_webhook_events.event_id + conditional UPDATE
 * WHERE payment_status <> 'paid' so payment.received fires once.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildProjectPayload,
  fireOutgoingWebhooks,
  getAgencyUserId,
} from '../_shared/outgoingWebhooks.ts'
import {
  applyAiAddonState,
  isSaasCheckoutSession,
  parseInterval,
  sendSaasInviteIfNeeded,
  sessionCustomerEmail,
  sessionIsPaid,
  subscriptionHasAiAddon,
  upsertLeadPaid,
  type BillingInterval,
} from '../_shared/saasBilling.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

function metaProjectId(obj: Record<string, unknown> | undefined): string {
  const meta = obj?.metadata as Record<string, unknown> | undefined
  return meta && typeof meta.project_id === 'string' ? meta.project_id : ''
}

async function completePaymentChecklist(projectId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('checklist_items')
    .update({
      completed: true,
      value: 'Paiement confirmé',
      submitted_at: new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('type', 'payment')
    .eq('completed', false)
  if (error) console.error('completePaymentChecklist:', error.message)
}

/**
 * Marks project paid once, completes payment checklist item, fires payment.received once.
 * Verifies metadata.project_id and amount_total === price * 100.
 */
async function handleConnectCheckoutPaid(session: Record<string, unknown>): Promise<void> {
  const sessionPaymentStatus =
    typeof session.payment_status === 'string' ? session.payment_status : ''
  if (sessionPaymentStatus !== 'paid') {
    console.log('checkout.session.completed skipped, payment_status=', sessionPaymentStatus)
    return
  }

  const projectId = metaProjectId(session)
  if (!projectId) {
    console.error('checkout.session.completed: missing metadata.project_id')
    return
  }

  const { data: existing } = await supabaseAdmin
    .from('projects')
    .select('id, price, payment_status')
    .eq('id', projectId)
    .maybeSingle()

  if (!existing) {
    console.error('checkout.session.completed: project not found', projectId)
    return
  }

  const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : null
  const expectedCents =
    existing.price != null && Number(existing.price) > 0
      ? Math.round(Number(existing.price) * 100)
      : null

  if (expectedCents == null || amountTotal !== expectedCents) {
    console.error(
      'checkout.session.completed amount mismatch:',
      { projectId, amountTotal, expectedCents, price: existing.price },
    )
    return
  }

  // Conditional update: only the first transition to paid proceeds.
  const { data: updatedRows, error: pErr } = await supabaseAdmin
    .from('projects')
    .update({
      payment_status: 'paid',
      stripe_checkout_url: null,
      stripe_checkout_session_id: null,
    })
    .eq('id', projectId)
    .neq('payment_status', 'paid')
    .select('id')

  if (pErr) {
    console.error('checkout.session.completed project update:', pErr.message)
    return
  }
  if (!updatedRows?.length) {
    console.log('checkout.session.completed already paid, skip side effects', projectId)
    return
  }

  await completePaymentChecklist(projectId)

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select(
      'id, name, client_name, client_email, agency_id, token, status, price, payment_status, agencies(id, name)',
    )
    .eq('id', projectId)
    .single()

  if (!project) return

  const agenciesRel = project.agencies as
    | { id?: string; name?: string }
    | { id?: string; name?: string }[]
    | null
  const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
  const userId = await getAgencyUserId(supabaseAdmin, project.agency_id as string)
  if (userId && agencyRow) {
    fireOutgoingWebhooks(
      supabaseAdmin,
      userId,
      'payment.received',
      buildProjectPayload(
        project,
        {
          id: String(agencyRow.id ?? project.agency_id),
          name: String(agencyRow.name ?? 'Agence'),
        },
        {
          meta: {
            source: 'stripe',
            amount_cents: amountTotal,
            currency: typeof session.currency === 'string' ? session.currency : 'eur',
          },
        },
      ),
    )
  }
}

async function markProjectPaymentFailed(projectId: string): Promise<void> {
  if (!projectId) return
  const { error } = await supabaseAdmin
    .from('projects')
    .update({
      payment_status: 'failed',
      stripe_checkout_url: null,
      stripe_checkout_session_id: null,
    })
    .eq('id', projectId)
    .neq('payment_status', 'paid')
    .neq('payment_status', 'refunded')
  if (error) console.error('markProjectPaymentFailed:', error.message)
}

async function handleChargeRefunded(charge: Record<string, unknown>): Promise<void> {
  const projectId = metaProjectId(charge)
  if (!projectId) {
    console.log('charge.refunded: no metadata.project_id, skip')
    return
  }
  const amount = typeof charge.amount === 'number' ? charge.amount : null
  const amountRefunded =
    typeof charge.amount_refunded === 'number' ? charge.amount_refunded : null
  if (amount == null || amountRefunded == null) return

  // Full refund only → refunded. Partial refund keeps paid (no dedicated note column).
  if (amountRefunded < amount) {
    console.log('charge.refunded partial — keep paid', { projectId, amount, amountRefunded })
    return
  }

  const { error } = await supabaseAdmin
    .from('projects')
    .update({ payment_status: 'refunded' })
    .eq('id', projectId)
    .eq('payment_status', 'paid')
  if (error) console.error('charge.refunded update:', error.message)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

async function parseStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
): Promise<{ ok: true; event: Record<string, unknown> } | { ok: false; reason: string }> {
  if (!webhookSecret) return { ok: false, reason: 'STRIPE_WEBHOOK_SECRET not set' }
  if (!signatureHeader) return { ok: false, reason: 'Missing stripe-signature' }

  const parts = signatureHeader.split(',').map((p) => p.trim())
  let timestamp = ''
  const signatures: string[] = []
  for (const p of parts) {
    const eq = p.indexOf('=')
    if (eq === -1) continue
    const k = p.slice(0, eq)
    const v = p.slice(eq + 1)
    if (k === 't') timestamp = v
    if (k === 'v1') signatures.push(v)
  }
  if (!timestamp || signatures.length === 0) return { ok: false, reason: 'Invalid signature header' }

  const now = Math.floor(Date.now() / 1000)
  const t = parseInt(timestamp, 10)
  if (!Number.isFinite(t) || Math.abs(now - t) > 600) {
    return { ok: false, reason: 'Timestamp outside tolerance' }
  }

  const signedPayload = `${timestamp}.${rawBody}`
  const expected = await hmacSha256Hex(webhookSecret, signedPayload)
  const valid = signatures.some((s) => timingSafeEqual(expected, s))
  if (!valid) return { ok: false, reason: 'Signature mismatch' }

  try {
    const event = JSON.parse(rawBody) as Record<string, unknown>
    return { ok: true, event }
  } catch {
    return { ok: false, reason: 'Invalid JSON' }
  }
}

async function handleSaasCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
  if (!sessionIsPaid(session)) {
    console.log('saas checkout skipped, not paid')
    return
  }
  const email = sessionCustomerEmail(session)
  if (!email) {
    console.error('saas checkout: missing email')
    return
  }
  const meta = (session.metadata ?? {}) as Record<string, unknown>
  const interval = parseInterval(meta.freli_interval) ?? ('month' as BillingInterval)
  const source = meta.freli_source === 'admin' ? 'admin' : 'pricing'
  const sessionId = typeof session.id === 'string' ? session.id : ''
  const customerId = typeof session.customer === 'string' ? session.customer : null
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null

  const leadId = await upsertLeadPaid(supabaseAdmin, {
    email,
    sessionId,
    customerId,
    subscriptionId,
    interval,
    source,
  })

  await sendSaasInviteIfNeeded(supabaseAdmin, email, leadId)
}

async function syncSubscriptionStatus(subscription: Record<string, unknown>): Promise<void> {
  const meta = (subscription.metadata ?? {}) as Record<string, unknown>
  if (meta.freli_saas !== '1' && meta.freli_saas !== 1) return

  const subscriptionId = typeof subscription.id === 'string' ? subscription.id : ''
  if (!subscriptionId) return

  const stripeStatus = typeof subscription.status === 'string' ? subscription.status : ''
  let status: 'active' | 'past_due' | 'canceled' | 'incomplete' = 'incomplete'
  if (stripeStatus === 'active' || stripeStatus === 'trialing') status = 'active'
  else if (stripeStatus === 'past_due') status = 'past_due'
  else if (stripeStatus === 'canceled' || stripeStatus === 'unpaid') status = 'canceled'

  const periodEnd =
    typeof subscription.current_period_end === 'number'
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null
  const interval = parseInterval(meta.freli_interval)

  const aiAddonActive =
    status === 'active' || status === 'past_due'
      ? await subscriptionHasAiAddon(subscription)
      : false

  const { data: account, error } = await supabaseAdmin
    .from('billing_accounts')
    .update({
      status,
      current_period_end: periodEnd,
      ai_addon_active: aiAddonActive,
      ...(interval ? { billing_interval: interval } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId)
    .select('agency_id')
    .maybeSingle()

  if (error) {
    console.error('syncSubscriptionStatus:', error.message)
    return
  }

  if (account?.agency_id) {
    await applyAiAddonState(supabaseAdmin, account.agency_id, aiAddonActive)
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')
  const parsed = await parseStripeWebhook(rawBody, sig)
  if (!parsed.ok) {
    console.error('stripe-webhook verify failed:', parsed.reason)
    return new Response(JSON.stringify({ error: parsed.reason }), { status: 400 })
  }

  const event = parsed.event
  const type = String(event.type ?? '')
  const eventId = typeof event.id === 'string' ? event.id : ''

  try {
    if (eventId) {
      const { error: idemErr } = await supabaseAdmin.from('stripe_webhook_events').insert({
        event_id: eventId,
        event_type: type || 'unknown',
      })
      if (idemErr) {
        if (idemErr.code === '23505') {
          return new Response(JSON.stringify({ received: true, duplicate: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        console.error('stripe-webhook idempotency insert failed:', idemErr.message)
      }
    }

    if (type === 'account.updated') {
      const account = event.data as { object?: Record<string, unknown> } | undefined
      const obj = account?.object
      const accountId = obj && typeof obj.id === 'string' ? obj.id : ''
      if (!accountId.startsWith('acct_')) {
        return new Response(JSON.stringify({ received: true }), { status: 200 })
      }
      const charges_enabled = Boolean(obj?.charges_enabled)
      const details_submitted = Boolean(obj?.details_submitted)

      const { data: rows, error: qErr } = await supabaseAdmin
        .from('integrations')
        .select('id, config')
        .eq('provider', 'stripe')
        .contains('config', { stripe_connect_account_id: accountId })

      if (qErr) throw new Error(qErr.message)
      for (const row of rows ?? []) {
        const cfg = (row.config ?? {}) as Record<string, unknown>
        const nextConfig = {
          ...cfg,
          stripe_connect_account_id: accountId,
          charges_enabled,
          details_submitted,
        }
        const { error: uErr } = await supabaseAdmin
          .from('integrations')
          .update({ config: nextConfig })
          .eq('id', row.id)
        if (uErr) console.error('account.updated update failed:', uErr.message)
      }
    }

    if (type === 'checkout.session.completed') {
      const sessionWrapper = event.data as { object?: Record<string, unknown> } | undefined
      const session = sessionWrapper?.object
      if (session && isSaasCheckoutSession(session)) {
        await handleSaasCheckoutCompleted(session)
      } else if (session) {
        await handleConnectCheckoutPaid(session)
      }
    }

    if (
      type === 'checkout.session.async_payment_failed' ||
      type === 'payment_intent.payment_failed'
    ) {
      const wrapper = event.data as { object?: Record<string, unknown> } | undefined
      const obj = wrapper?.object
      if (obj && !isSaasCheckoutSession(obj)) {
        await markProjectPaymentFailed(metaProjectId(obj))
      }
    }

    if (type === 'checkout.session.expired') {
      const sessionWrapper = event.data as { object?: Record<string, unknown> } | undefined
      const session = sessionWrapper?.object
      const projectId = metaProjectId(session)
      if (projectId) {
        const { error: pErr } = await supabaseAdmin
          .from('projects')
          .update({ stripe_checkout_url: null, stripe_checkout_session_id: null })
          .eq('id', projectId)
          .neq('payment_status', 'paid')
        if (pErr) console.error('checkout.session.expired project update:', pErr.message)
      }
    }

    if (type === 'charge.refunded') {
      const wrapper = event.data as { object?: Record<string, unknown> } | undefined
      if (wrapper?.object) await handleChargeRefunded(wrapper.object)
    }

    if (
      type === 'customer.subscription.updated' ||
      type === 'customer.subscription.deleted'
    ) {
      const subWrapper = event.data as { object?: Record<string, unknown> } | undefined
      if (subWrapper?.object) await syncSubscriptionStatus(subWrapper.object)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('stripe-webhook handler error:', message)
    if (eventId) {
      await supabaseAdmin.from('stripe_webhook_events').delete().eq('event_id', eventId)
    }
    return new Response(JSON.stringify({ error: message }), { status: 500 })
  }
})
