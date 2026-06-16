import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ensureCheckoutSession, stripeConnectReady } from '../_shared/stripeCheckout.ts'

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
    const rawBody = await req.text()
    const body = (rawBody ? JSON.parse(rawBody) : {}) as { projectId?: string; sendEmail?: boolean }
    if (!body.projectId) {
      return new Response(JSON.stringify({ error: 'Missing projectId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const sendEmail = body.sendEmail !== false

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select(
        'id, client_name, client_email, token, price, payment_status, status, agency_id, stripe_checkout_url, stripe_checkout_session_id, agencies(user_id)',
      )
      .eq('id', body.projectId)
      .single()
    if (projectError || !project) throw new Error('Project not found')

    const agenciesRel = project.agencies as { user_id?: string } | { user_id?: string }[] | null
    const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
    if (agencyRow?.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (project.payment_status === 'paid') {
      return new Response(JSON.stringify({ error: 'Projet déjà payé' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!project.price || project.price <= 0) {
      return new Response(JSON.stringify({ error: 'Aucun montant à facturer' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('provider', 'stripe')
      .maybeSingle()

    const connect = stripeConnectReady((integration?.config ?? {}) as Record<string, unknown>)
    if (!connect) {
      return new Response(JSON.stringify({ error: 'Stripe non configuré ou non prêt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const session = await ensureCheckoutSession(project, connect)
    if (!session) {
      return new Response(JSON.stringify({ error: 'Impossible de créer la session de paiement' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let emailSent = false
    if (sendEmail) {
      const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
      const { error: emailError } = await supabaseAdmin.functions.invoke('send-payment-link-email', {
        body: { projectId: project.id },
        headers: cronSecret ? { 'x-internal-secret': cronSecret } : undefined,
      })
      emailSent = !emailError
      if (emailError) console.error('send-payment-link-email failed:', emailError.message)
    }

    return new Response(
      JSON.stringify({ success: true, checkoutUrl: session.checkoutUrl, emailSent }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('stripe-payment-link error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
