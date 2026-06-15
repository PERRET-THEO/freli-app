import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildProjectPayload,
  dispatchToSingleWebhook,
  type WebhookEndpoint,
} from '../_shared/outgoingWebhooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

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

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

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
    const body = (await req.json()) as { webhookId?: string }
    const webhookId = typeof body.webhookId === 'string' ? body.webhookId.trim() : ''
    if (!webhookId) {
      return new Response(JSON.stringify({ error: 'Missing webhookId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: row, error: fetchError } = await supabaseAdmin
      .from('integrations')
      .select('id, access_token, config')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .eq('provider', 'webhook')
      .single()

    if (fetchError || !row) {
      return new Response(JSON.stringify({ error: 'Webhook not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const testData = buildProjectPayload(
      {
        id: '00000000-0000-0000-0000-000000000000',
        client_name: 'Client Test',
        client_email: 'client@example.com',
        agency_id: '00000000-0000-0000-0000-000000000001',
        token: 'test-token',
        status: 'completed',
        price: 1500,
        payment_status: 'pending',
      },
      { id: '00000000-0000-0000-0000-000000000001', name: 'Agence Test' },
      { meta: { source: 'test', message: 'Ceci est un envoi de test depuis Freli.' } },
    )

    const result = await dispatchToSingleWebhook(
      row as WebhookEndpoint,
      'webhook.test',
      testData,
    )

    if (!result.ok) {
      return new Response(JSON.stringify({ ok: false, error: result.error ?? 'Delivery failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, status: result.status }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
