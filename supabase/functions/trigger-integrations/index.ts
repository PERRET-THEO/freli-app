import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

const supabase = createClient(supabaseUrl, serviceRoleKey)

type Integration = {
  id: string
  provider: string
  access_token: string | null
  refresh_token: string | null
  config: Record<string, unknown>
}

type ProjectData = {
  id: string
  client_name: string
  client_email: string | null
  agency_id: string
  token: string
  price: number | null
  payment_status: string | null
}

function stripeConnectReady(config: Record<string, unknown>): { accountId: string } | null {
  const accountId =
    typeof config.stripe_connect_account_id === 'string' ? config.stripe_connect_account_id : ''
  const charges = config.charges_enabled === true
  if (!accountId.startsWith('acct_') || !charges) return null
  return { accountId }
}

type Results = {
  stripe?: { checkoutUrl: string }
  google_drive?: { folderUrl: string }
  hubspot?: { contactId: string }
}

async function handleStripe(
  integration: Integration,
  project: ProjectData,
): Promise<{ checkoutUrl: string } | null> {
  if (!stripeSecretKey) {
    console.warn('STRIPE_SECRET_KEY not set, skipping Stripe integration')
    return null
  }

  const cfg = integration.config ?? {}
  const connect = stripeConnectReady(cfg as Record<string, unknown>)
  if (!connect) {
    console.log(
      'Stripe Connect account missing or not ready (charges_enabled), skipping checkout. config=',
      JSON.stringify(cfg),
    )
    return null
  }

  const rawProjectPrice = project.price
  const price =
    typeof rawProjectPrice === 'string'
      ? parseInt(String(rawProjectPrice), 10)
      : Number(rawProjectPrice ?? 0)
  const currency = String(integration.config?.currency ?? 'eur')

  if (!price || price <= 0 || !Number.isFinite(price)) {
    console.log('Invalid project price, skipping Stripe checkout. price=', rawProjectPrice)
    return null
  }

  const params = new URLSearchParams()
  params.append('mode', 'payment')
  params.append('success_url', `${appUrl}/p/${project.token}?payment=success`)
  params.append('cancel_url', `${appUrl}/p/${project.token}?payment=cancelled`)
  params.append('line_items[0][price_data][currency]', currency)
  params.append('line_items[0][price_data][unit_amount]', String(Math.round(price * 100)))
  params.append('line_items[0][price_data][product_data][name]', `Onboarding — ${project.client_name}`)
  params.append('line_items[0][quantity]', '1')
  params.append('client_reference_id', project.id)
  params.append('metadata[project_id]', project.id)
  if (project.client_email) {
    params.append('customer_email', project.client_email)
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': connect.accountId,
    },
    body: params.toString(),
  })

  const session = await response.json()
  if (!response.ok) {
    throw new Error(`Stripe error: ${session.error?.message ?? JSON.stringify(session)}`)
  }

  const checkoutUrl = session.url as string | null
  if (!checkoutUrl) {
    console.error('Stripe session missing url:', JSON.stringify(session))
    throw new Error('Stripe Checkout session has no url')
  }
  console.log('Stripe checkout session created:', session.id, 'url:', checkoutUrl)
  return { checkoutUrl }
}

async function handleGoogleDrive(
  integration: Integration,
  project: ProjectData,
): Promise<{ folderUrl: string } | null> {
  const accessToken = integration.access_token
  if (!accessToken) {
    console.warn('Google Drive access_token not set, skipping')
    return null
  }

  const folderPrefix = String(integration.config?.folderPrefix ?? 'Clients')
  const folderName = `${folderPrefix}/${project.client_name}`

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })

  const folder = await response.json()
  if (!response.ok) {
    throw new Error(`Google Drive error: ${folder.error?.message ?? JSON.stringify(folder)}`)
  }

  console.log('Google Drive folder created:', folder.id)
  return { folderUrl: `https://drive.google.com/drive/folders/${folder.id}` }
}

async function handleHubspot(
  integration: Integration,
  project: ProjectData,
): Promise<{ contactId: string } | null> {
  const apiKey = integration.access_token || String(integration.config?.apiKey ?? '')
  if (!apiKey) {
    console.warn('HubSpot API key not set, skipping')
    return null
  }

  const nameParts = project.client_name.split(' ')
  const firstName = nameParts[0] ?? ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        firstname: firstName,
        lastname: lastName,
        email: project.client_email ?? '',
      },
    }),
  })

  const contact = await response.json()
  if (!response.ok) {
    throw new Error(`HubSpot error: ${contact.message ?? JSON.stringify(contact)}`)
  }

  console.log('HubSpot contact created:', contact.id)
  return { contactId: contact.id }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    console.log('=== trigger-integrations START ===')
    const rawBody = await req.text()

    if (!rawBody || rawBody.trim() === '') {
      return new Response(JSON.stringify({ error: 'Body vide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = JSON.parse(rawBody) as { projectId?: string; projectToken?: string }
    if (!body.projectId || typeof body.projectToken !== 'string' || !body.projectToken.trim()) {
      return new Response(JSON.stringify({ error: 'Missing projectId or projectToken' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, client_name, client_email, agency_id, token, price, payment_status')
      .eq('id', body.projectId)
      .single()

    if (projectError || !project || project.token !== body.projectToken) {
      return new Response(JSON.stringify({ error: 'Invalid project' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('user_id')
      .eq('id', project.agency_id)
      .single()

    if (agencyError || !agency) {
      throw new Error('Agency not found')
    }

    const { data: integrations, error: integrationsError } = await supabase
      .from('integrations')
      .select('id, provider, access_token, refresh_token, config')
      .eq('user_id', agency.user_id)

    if (integrationsError) {
      throw new Error(`Failed to fetch integrations: ${integrationsError.message}`)
    }

    if (!integrations || integrations.length === 0) {
      console.log('No integrations configured for user, nothing to trigger')
      return new Response(JSON.stringify({ results: {} }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Found ${integrations.length} integration(s) to trigger`)
    const results: Results = {}

    for (const integration of integrations as Integration[]) {
      try {
        switch (integration.provider) {
          case 'stripe': {
            const stripeResult = await handleStripe(integration, project as ProjectData)
            if (stripeResult) results.stripe = stripeResult
            break
          }
          case 'google_drive': {
            const driveResult = await handleGoogleDrive(integration, project as ProjectData)
            if (driveResult) results.google_drive = driveResult
            break
          }
          case 'hubspot': {
            const hubspotResult = await handleHubspot(integration, project as ProjectData)
            if (hubspotResult) results.hubspot = hubspotResult
            break
          }
          default:
            console.warn(`Unknown integration provider: ${integration.provider}`)
        }
      } catch (integrationError) {
        const msg = integrationError instanceof Error ? integrationError.message : String(integrationError)
        console.error(`Integration ${integration.provider} failed:`, msg)
      }
    }

    console.log('=== trigger-integrations DONE ===', JSON.stringify(results))
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('trigger-integrations error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
