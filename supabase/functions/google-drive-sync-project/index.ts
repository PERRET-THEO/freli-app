import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ensureProjectDriveFolder, syncProjectArtifactsToDrive } from '../_shared/googleDrive.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

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
    const body = (await req.json()) as { projectId?: string }
    if (!body.projectId) {
      return new Response(JSON.stringify({ error: 'Missing projectId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select(
        'id, client_name, status, agency_id, google_drive_folder_id, google_drive_folder_url, agencies(user_id)',
      )
      .eq('id', body.projectId)
      .single()
    if (projectError || !project) throw new Error('Project not found')

    const agenciesRel = project.agencies as { user_id?: string } | { user_id?: string }[] | null
    const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
    const ownerUserId = agencyRow?.user_id
    if (!ownerUserId || ownerUserId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (project.status !== 'completed') {
      return new Response(JSON.stringify({ error: 'Le projet doit être terminé' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('id, access_token, refresh_token, config')
      .eq('user_id', ownerUserId)
      .eq('provider', 'google_drive')
      .maybeSingle()

    const cfg = (integration?.config ?? {}) as Record<string, unknown>
    if (!integration || cfg.connected !== true) {
      return new Response(JSON.stringify({ error: 'Google Drive non connecté' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await ensureProjectDriveFolder(integration, project)

    const sync = await syncProjectArtifactsToDrive(integration, project.id, result.folderId)

    return new Response(
      JSON.stringify({
        success: true,
        folderUrl: result.folderUrl,
        filesUploaded: sync.uploaded,
        filesSkipped: sync.skipped,
        status: sync.status,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('google-drive-sync-project:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
