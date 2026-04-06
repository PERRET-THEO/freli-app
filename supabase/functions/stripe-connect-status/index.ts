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

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

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

    if (fetchError) throw new Error(fetchError.message)
    if (!row?.id) {
      return new Response(
        JSON.stringify({ connected: false, charges_enabled: false, details_submitted: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const cfg = row.config as Record<string, unknown>
    const accountId =
      typeof cfg.stripe_connect_account_id === 'string' ? cfg.stripe_connect_account_id : ''
    if (!accountId.startsWith('acct_')) {
      return new Response(
        JSON.stringify({ connected: true, charges_enabled: false, details_submitted: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const accRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Stripe-Account': accountId,
      },
    })
    const acc = await accRes.json()
    if (!accRes.ok) {
      throw new Error(acc.error?.message ?? JSON.stringify(acc))
    }

    const charges_enabled = Boolean(acc.charges_enabled)
    const details_submitted = Boolean(acc.details_submitted)
    const nextConfig = {
      ...cfg,
      currency: typeof cfg.currency === 'string' ? cfg.currency : 'eur',
      stripe_connect_account_id: accountId,
      charges_enabled,
      details_submitted,
    }

    const { error: upErr } = await supabaseAdmin
      .from('integrations')
      .update({ config: nextConfig })
      .eq('id', row.id)
    if (upErr) throw new Error(upErr.message)

    return new Response(
      JSON.stringify({
        connected: true,
        charges_enabled,
        details_submitted,
        accountIdSuffix: accountId.slice(-6),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('stripe-connect-status:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
