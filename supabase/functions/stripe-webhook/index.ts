import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildProjectPayload,
  fireOutgoingWebhooks,
  getAgencyUserId,
} from '../_shared/outgoingWebhooks.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

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

/** Verify Stripe-Signature and parse JSON body. */
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
        // Unique violation → already processed
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
      const sessionPaymentStatus =
        session && typeof session.payment_status === 'string' ? session.payment_status : ''
      if (sessionPaymentStatus !== 'paid') {
        console.log('checkout.session.completed skipped, payment_status=', sessionPaymentStatus)
        return new Response(JSON.stringify({ received: true, skipped: 'not_paid' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const meta = session?.metadata as Record<string, unknown> | undefined
      const projectId = meta && typeof meta.project_id === 'string' ? meta.project_id : ''
      if (projectId) {
        const { error: pErr } = await supabaseAdmin
          .from('projects')
          .update({
            payment_status: 'paid',
            stripe_checkout_url: null,
            stripe_checkout_session_id: null,
          })
          .eq('id', projectId)
        if (pErr) console.error('checkout.session.completed project update:', pErr.message)

        const { data: project } = await supabaseAdmin
          .from('projects')
          .select('id, client_name, client_email, agency_id, token, status, price, payment_status, agencies(id, name)')
          .eq('id', projectId)
          .single()

        if (project) {
          const agenciesRel = project.agencies as { id?: string; name?: string } | { id?: string; name?: string }[] | null
          const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
          const userId = await getAgencyUserId(supabaseAdmin, project.agency_id as string)
          if (userId && agencyRow) {
            const amountTotal = session && typeof session.amount_total === 'number' ? session.amount_total : null
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
                    currency: session && typeof session.currency === 'string' ? session.currency : 'eur',
                  },
                },
              ),
            )
          }
        }
      }
    }

    if (type === 'checkout.session.expired') {
      const sessionWrapper = event.data as { object?: Record<string, unknown> } | undefined
      const session = sessionWrapper?.object
      const meta = session?.metadata as Record<string, unknown> | undefined
      const projectId = meta && typeof meta.project_id === 'string' ? meta.project_id : ''
      if (projectId) {
        // Session expirée sans paiement : effacer le lien obsolète pour permettre régénération.
        const { error: pErr } = await supabaseAdmin
          .from('projects')
          .update({ stripe_checkout_url: null, stripe_checkout_session_id: null })
          .eq('id', projectId)
          .neq('payment_status', 'paid')
        if (pErr) console.error('checkout.session.expired project update:', pErr.message)
      }
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
