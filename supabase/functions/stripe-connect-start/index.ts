import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')
const defaultCountry = (Deno.env.get('STRIPE_CONNECT_DEFAULT_COUNTRY') ?? 'FR').toUpperCase()

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

async function stripeFormPost(path: string, params: URLSearchParams, stripeAccount?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount
  return await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers,
    body: params.toString(),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: 'Stripe is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { data: row, error: fetchError } = await supabaseAdmin
      .from('integrations')
      .select('id, config')
      .eq('user_id', user.id)
      .eq('provider', 'stripe')
      .maybeSingle()

    if (fetchError) {
      throw new Error(fetchError.message)
    }

    let accountId =
      row?.config &&
      typeof (row.config as Record<string, unknown>).stripe_connect_account_id === 'string'
        ? String((row.config as Record<string, unknown>).stripe_connect_account_id)
        : ''

    if (!accountId || !accountId.startsWith('acct_')) {
      const params = new URLSearchParams()
      params.append('type', 'express')
      params.append('country', defaultCountry)
      params.append('email', user.email ?? '')
      params.append('capabilities[card_payments][requested]', 'true')
      params.append('capabilities[transfers][requested]', 'true')

      const accRes = await stripeFormPost('accounts', params)
      const acc = await accRes.json()
      if (!accRes.ok) {
        throw new Error(acc.error?.message ?? JSON.stringify(acc))
      }
      accountId = acc.id as string

      const nextConfig = {
        currency: 'eur',
        stripe_connect_account_id: accountId,
        charges_enabled: Boolean(acc.charges_enabled),
        details_submitted: Boolean(acc.details_submitted),
      }

      if (row?.id) {
        const { error: upErr } = await supabaseAdmin
          .from('integrations')
          .update({ config: nextConfig })
          .eq('id', row.id)
        if (upErr) throw new Error(upErr.message)
      } else {
        const { error: insErr } = await supabaseAdmin.from('integrations').insert({
          user_id: user.id,
          provider: 'stripe',
          config: nextConfig,
        })
        if (insErr) throw new Error(insErr.message)
      }
    }

    const linkParams = new URLSearchParams()
    linkParams.append('account', accountId)
    linkParams.append('refresh_url', `${appUrl}/dashboard/integrations?stripe=refresh`)
    linkParams.append('return_url', `${appUrl}/dashboard/integrations?stripe=return`)
    linkParams.append('type', 'account_onboarding')

    const linkRes = await stripeFormPost('account_links', linkParams)
    const link = await linkRes.json()
    if (!linkRes.ok) {
      throw new Error(link.error?.message ?? JSON.stringify(link))
    }

    const url = link.url as string | undefined
    if (!url) throw new Error('Stripe Account Link missing url')

    return new Response(JSON.stringify({ url, accountId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('stripe-connect-start:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
