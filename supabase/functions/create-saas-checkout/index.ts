import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, getAuthenticatedUser, jsonResponse } from '../_shared/functionAuth.ts'
import {
  createServiceClient,
  getAppUrl,
  isInviteAdminEmail,
  parseInterval,
  parseSource,
  resolveAiPriceId,
  resolveSubscriptionPriceId,
  stripeFormPost,
} from '../_shared/saasBilling.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = (await req.json()) as {
      interval?: string
      source?: string
      email?: string
      includeAi?: boolean
    }

    const interval = parseInterval(body.interval)
    const source = parseSource(body.source) ?? 'pricing'
    const includeAi = body.includeAi === true
    if (!interval) {
      return jsonResponse({ error: 'interval must be month or year' }, 400)
    }

    let customerEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (source === 'admin') {
      const user = await getAuthenticatedUser(req)
      if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
      if (!isInviteAdminEmail(user.email)) return jsonResponse({ error: 'Forbidden' }, 403)
      if (!customerEmail || !customerEmail.includes('@')) {
        return jsonResponse({ error: 'email is required for admin checkout links' }, 400)
      }
    } else if (customerEmail && !customerEmail.includes('@')) {
      return jsonResponse({ error: 'Invalid email' }, 400)
    }

    const priceId = await resolveSubscriptionPriceId(interval)
    if (!priceId) {
      return jsonResponse(
        {
          error:
            'Stripe Price IDs not configured (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY)',
        },
        500,
      )
    }

    let aiPriceId = ''
    if (includeAi) {
      aiPriceId = await resolveAiPriceId(interval)
      if (!aiPriceId) {
        return jsonResponse(
          {
            error:
              'Stripe AI Price IDs not configured (STRIPE_PRICE_AI_MONTHLY / STRIPE_PRICE_AI_YEARLY)',
          },
          500,
        )
      }
    }

    const appUrl = getAppUrl()
    const params = new URLSearchParams()
    params.set('mode', 'subscription')
    params.set('success_url', `${appUrl}/signup?session_id={CHECKOUT_SESSION_ID}`)
    params.set('cancel_url', `${appUrl}/tarifs`)
    params.set('line_items[0][price]', priceId)
    params.set('line_items[0][quantity]', '1')
    if (includeAi && aiPriceId) {
      params.set('line_items[1][price]', aiPriceId)
      params.set('line_items[1][quantity]', '1')
    }
    params.set('allow_promotion_codes', 'true')
    params.set('billing_address_collection', 'required')
    params.set('tax_id_collection[enabled]', 'true')
    params.set('automatic_tax[enabled]', 'true')
    params.set('metadata[freli_saas]', '1')
    params.set('metadata[freli_interval]', interval)
    params.set('metadata[freli_source]', source)
    params.set('metadata[freli_ai]', includeAi ? '1' : '0')
    params.set('subscription_data[metadata][freli_saas]', '1')
    params.set('subscription_data[metadata][freli_interval]', interval)
    params.set('subscription_data[metadata][freli_source]', source)
    params.set('subscription_data[metadata][freli_ai]', includeAi ? '1' : '0')
    params.set('locale', 'fr')

    if (customerEmail) {
      params.set('customer_email', customerEmail)
    }

    const created = await stripeFormPost('checkout/sessions', params)
    if (!created.ok) {
      return jsonResponse({ error: created.error }, created.status >= 400 ? created.status : 500)
    }

    const session = created.json
    const sessionId = typeof session.id === 'string' ? session.id : ''
    const checkoutUrl = typeof session.url === 'string' ? session.url : ''
    if (!sessionId || !checkoutUrl) {
      return jsonResponse({ error: 'Stripe Checkout session incomplete' }, 500)
    }

    const supabase = createServiceClient()
    const now = new Date().toISOString()
    await supabase.from('subscription_leads').insert({
      email: customerEmail || `pending+${sessionId}@freli.local`,
      source,
      billing_interval: interval,
      checkout_session_id: sessionId,
      status: 'checkout_created',
      updated_at: now,
    })

    return jsonResponse({
      ok: true,
      checkoutUrl,
      sessionId,
      interval,
      source,
      includeAi,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('create-saas-checkout:', message)
    return jsonResponse({ error: message }, 500)
  }
})
