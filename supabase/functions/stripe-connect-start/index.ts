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

async function stripeFormPost(path: string, params: URLSearchParams) {
  return await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Pin API version so Connect Express (Accounts v1 + Account Links) keeps working
      // on platforms whose default version is Accounts-v2-first (e.g. 2026-03-25.dahlia).
      'Stripe-Version': '2025-04-30.basil',
    },
    body: params.toString(),
  })
}

function stripeErrorMessage(body: Record<string, unknown>): string {
  const err = body.error as
    | { message?: string; code?: string; request_log_url?: string; doc_url?: string }
    | string
    | undefined
  if (typeof err === 'string') return err
  if (err && typeof err.message === 'string') {
    const bits = [err.message]
    if (err.code) bits.push(`(code: ${err.code})`)
    return bits.join(' ')
  }
  return JSON.stringify(body)
}

function withLiveHint(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('accounts v1') || lower.includes('feat_accounts_v1') || lower.includes('/v2/core/accounts')) {
    return `${message} — Activez le support Accounts v1 : https://dashboard.stripe.com/settings/features/feat_accounts_v1_support`
  }
  if (
    lower.includes('platform profile') ||
    lower.includes('managing losses') ||
    lower.includes('responsibilities') ||
    lower.includes('questionnaire')
  ) {
    return `${message} — Complétez https://dashboard.stripe.com/settings/connect/platform_profile (mode Live) et le questionnaire Connect.`
  }
  if (lower.includes('invalid api key') || lower.includes('no such api key')) {
    return `${message} — Vérifiez le secret Supabase STRIPE_SECRET_KEY (sk_live_...).`
  }
  return message
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
    return new Response(JSON.stringify({ error: 'Stripe is not configured (STRIPE_SECRET_KEY manquant)' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!stripeSecretKey.startsWith('sk_')) {
    return new Response(
      JSON.stringify({
        error: 'STRIPE_SECRET_KEY invalide : attendu sk_live_... (ou sk_test_... en staging)',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
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

    const createExpressAccount = async (): Promise<string> => {
      // Classic Express (worked in Test). Prefer type= over controller hash for Account Links.
      const params = new URLSearchParams()
      params.append('type', 'express')
      params.append('country', defaultCountry)
      params.append('email', user.email ?? '')
      params.append('capabilities[card_payments][requested]', 'true')
      params.append('capabilities[transfers][requested]', 'true')

      const accRes = await stripeFormPost('accounts', params)
      const acc = (await accRes.json()) as Record<string, unknown>
      if (!accRes.ok) {
        console.error('stripe-connect-start accounts.create failed:', JSON.stringify(acc))
        const detailed = withLiveHint(stripeErrorMessage(acc))
        throw new Error(detailed)
      }
      const newId = acc.id as string

      const nextConfig = {
        currency: 'eur',
        stripe_connect_account_id: newId,
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
      return newId
    }

    if (!accountId || !accountId.startsWith('acct_')) {
      accountId = await createExpressAccount()
    }

    const linkParams = new URLSearchParams()
    linkParams.append('account', accountId)
    linkParams.append('refresh_url', `${appUrl}/dashboard/integrations?stripe=refresh`)
    linkParams.append('return_url', `${appUrl}/dashboard/integrations?stripe=return`)
    linkParams.append('type', 'account_onboarding')

    let linkRes = await stripeFormPost('account_links', linkParams)
    let link = await linkRes.json()

    // Compte Test orphelin après bascule sk_live_ → recréer un compte Live
    if (!linkRes.ok) {
      const msg = stripeErrorMessage(link)
      const stale =
        /no such account|does not exist|similar object exists in test mode|similar object exists in live mode/i.test(
          msg,
        )
      if (stale) {
        console.warn('stripe-connect-start: stale Connect account, recreating:', accountId, msg)
        accountId = await createExpressAccount()
        linkParams.set('account', accountId)
        linkRes = await stripeFormPost('account_links', linkParams)
        link = await linkRes.json()
      }
    }

    if (!linkRes.ok) {
      throw new Error(withLiveHint(stripeErrorMessage(link)))
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
