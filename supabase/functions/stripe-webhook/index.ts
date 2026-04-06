import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  try {
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
      const meta = session?.metadata as Record<string, unknown> | undefined
      const projectId = meta && typeof meta.project_id === 'string' ? meta.project_id : ''
      if (projectId) {
        const { error: pErr } = await supabaseAdmin
          .from('projects')
          .update({ payment_status: 'paid' })
          .eq('id', projectId)
        if (pErr) console.error('checkout.session.completed project update:', pErr.message)
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('stripe-webhook handler error:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500 })
  }
})
