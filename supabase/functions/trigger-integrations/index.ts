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
  stripe_checkout_url: string | null
  stripe_checkout_session_id: string | null
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
  const connect = stripeConnectReady((integration.config ?? {}) as Record<string, unknown>)
  if (!connect) {
    console.log('Stripe Connect not ready, skipping checkout.')
    return null
  }
  return await ensureCheckoutSession(project, connect)
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
      .select('id, client_name, client_email, agency_id, token, price, payment_status, stripe_checkout_url, stripe_checkout_session_id')
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
            if (stripeResult) {
              results.stripe = stripeResult
              // Email automatique au client avec le lien de paiement (fin onboarding).
              const { error: emailError } = await supabase.functions.invoke(
                'send-payment-link-email',
                { body: { projectId: project.id } },
              )
              if (emailError) console.error('payment email failed:', emailError.message)
            }
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
