import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'
import {
  createServiceClient,
  findAuthUserIdByEmail,
  isSaasCheckoutSession,
  parseInterval,
  sessionCustomerEmail,
  sessionIsPaid,
  stripeGet,
  type BillingInterval,
} from '../_shared/saasBilling.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = (await req.json()) as { sessionId?: string }
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!sessionId.startsWith('cs_')) {
      return jsonResponse({ error: 'Invalid session id' }, 400)
    }

    const fetched = await stripeGet(
      `checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
    )
    if (!fetched.ok) {
      return jsonResponse({ error: fetched.error }, fetched.status >= 400 ? fetched.status : 500)
    }

    const session = fetched.json
    if (!isSaasCheckoutSession(session)) {
      return jsonResponse({ error: 'Not a Freli subscription checkout' }, 400)
    }

    const paid = sessionIsPaid(session)
    const email = sessionCustomerEmail(session)
    const meta = (session.metadata ?? {}) as Record<string, unknown>
    const interval =
      parseInterval(meta.freli_interval) ??
      ('month' as BillingInterval)

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer && typeof session.customer === 'object' &&
            typeof (session.customer as { id?: string }).id === 'string'
          ? (session.customer as { id: string }).id
          : null

    let subscriptionId: string | null =
      typeof session.subscription === 'string' ? session.subscription : null
    if (
      !subscriptionId &&
      session.subscription &&
      typeof session.subscription === 'object' &&
      typeof (session.subscription as { id?: string }).id === 'string'
    ) {
      subscriptionId = (session.subscription as { id: string }).id
    }

    const supabase = createServiceClient()

    let existingUser = false
    if (email) {
      const { data: lead } = await supabase
        .from('subscription_leads')
        .select('status, agency_id')
        .eq('checkout_session_id', sessionId)
        .maybeSingle()

      if (lead?.agency_id) {
        existingUser = true
      } else {
        existingUser = Boolean(await findAuthUserIdByEmail(supabase, email))
      }
    }

    return jsonResponse({
      ok: true,
      paid,
      email,
      interval,
      customerId,
      subscriptionId,
      existingUser,
      sessionStatus: typeof session.status === 'string' ? session.status : null,
      paymentStatus: typeof session.payment_status === 'string' ? session.payment_status : null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('verify-saas-checkout:', message)
    return jsonResponse({ error: message }, 500)
  }
})
