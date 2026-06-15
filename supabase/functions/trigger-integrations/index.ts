import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ensureCheckoutSession, stripeConnectReady } from '../_shared/stripeCheckout.ts'
import { ensureProjectDriveFolder, syncProjectArtifactsToDrive } from '../_shared/googleDrive.ts'
import {
  buildProjectPayload,
  fetchChecklistItems,
  fireOutgoingWebhooks,
} from '../_shared/outgoingWebhooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
  status: string | null
  price: number | null
  payment_status: string | null
  stripe_checkout_url: string | null
  stripe_checkout_session_id: string | null
  google_drive_folder_id: string | null
  google_drive_folder_url: string | null
}

type Results = {
  stripe?: { checkoutUrl: string }
  google_drive?: { folderUrl: string; filesUploaded?: number; filesSkipped?: number }
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
): Promise<{ folderUrl: string; filesUploaded?: number; filesSkipped?: number } | null> {
  if (integration.config?.connected !== true) {
    console.log('Google Drive not connected, skipping')
    return null
  }
  const result = await ensureProjectDriveFolder(integration, project)
  const sync = await syncProjectArtifactsToDrive(integration, project.id, result.folderId)
  return { folderUrl: result.folderUrl, filesUploaded: sync.uploaded, filesSkipped: sync.skipped }
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
      .select('id, client_name, client_email, agency_id, token, status, price, payment_status, stripe_checkout_url, stripe_checkout_session_id, google_drive_folder_id, google_drive_folder_url')
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
      .select('user_id, id, name')
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

    const results: Results = {}

    if (integrations && integrations.length > 0) {
      console.log(`Found ${integrations.length} integration(s) to trigger`)

      for (const integration of integrations as Integration[]) {
        if (integration.provider === 'webhook') continue
        try {
          switch (integration.provider) {
            case 'stripe': {
              const stripeResult = await handleStripe(integration, project as ProjectData)
              if (stripeResult) {
                results.stripe = stripeResult
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
            default:
              console.warn(`Unknown integration provider: ${integration.provider}`)
          }
        } catch (integrationError) {
          const msg = integrationError instanceof Error ? integrationError.message : String(integrationError)
          console.error(`Integration ${integration.provider} failed:`, msg)
        }
      }
    }

    const { data: refreshedProject } = await supabase
      .from('projects')
      .select('id, client_name, client_email, agency_id, token, status, price, payment_status, stripe_checkout_url, google_drive_folder_url')
      .eq('id', project.id)
      .single()

    const projectForWebhook = (refreshedProject ?? project) as ProjectData
    const checklist = await fetchChecklistItems(supabase, project.id)

    fireOutgoingWebhooks(
      supabase,
      agency.user_id as string,
      'project.completed',
      buildProjectPayload(
        projectForWebhook,
        { id: agency.id as string, name: (agency.name as string) ?? 'Agence' },
        {
          checklist,
          integrations: {
            stripe_checkout_url: results.stripe?.checkoutUrl ?? projectForWebhook.stripe_checkout_url,
            google_drive_folder_url: results.google_drive?.folderUrl ?? projectForWebhook.google_drive_folder_url,
          },
          meta: { source: 'onboarding_complete' },
        },
      ),
    )

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
