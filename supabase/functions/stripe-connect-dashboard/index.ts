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

function isStaleConnectAccountError(message: string): boolean {
  return /no such account|does not exist|does not have access|application access may have been revoked|similar object exists in test mode|similar object exists in live mode/i.test(
    message,
  )
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

    if (fetchError) throw new Error(fetchError.message)

    const cfg = (row?.config ?? {}) as Record<string, unknown>
    const accountId =
      typeof cfg.stripe_connect_account_id === 'string' ? cfg.stripe_connect_account_id : ''

    if (!accountId.startsWith('acct_')) {
      return new Response(
        JSON.stringify({
          error: 'Compte Stripe non connecté. Reliez Stripe dans Intégrations.',
          code: 'stripe_reconnect_required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const linkRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}/login_links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2025-04-30.basil',
      },
    })

    const link = await linkRes.json()
    if (!linkRes.ok) {
      const stripeMessage = String(link.error?.message ?? JSON.stringify(link))
      console.error('stripe-connect-dashboard login_links:', stripeMessage)

      if (isStaleConnectAccountError(stripeMessage) && row?.id) {
        // Marque le lien orphelin pour forcer un vrai reconnect côté Intégrations.
        const nextConfig = {
          ...cfg,
          stripe_connect_account_id: null,
          charges_enabled: false,
          details_submitted: false,
          stale_connect_cleared_at: new Date().toISOString(),
        }
        await supabaseAdmin.from('integrations').update({ config: nextConfig }).eq('id', row.id)

        return new Response(
          JSON.stringify({
            error:
              'Compte Stripe inaccessible (accès révoqué ou compte orphelin). Reconnectez Stripe dans Intégrations.',
            code: 'stripe_reconnect_required',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      throw new Error(stripeMessage)
    }

    const url = link.url as string | undefined
    if (!url) throw new Error('Stripe login link missing url')

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('stripe-connect-dashboard:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
