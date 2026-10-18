/**
 * Side effects onboarding terminé (email agence, Stripe/Drive/webhooks).
 * - Appel serveur : x-internal-secret
 * - Kick portail : projectToken uniquement si projects.status = completed (déjà posé par RPC)
 * Ne pas appeler send-project-completed / trigger-integrations depuis le navigateur.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assertProjectToken,
  corsHeaders,
  internalSecretHeaders,
  isInternalRequest,
  jsonResponse,
} from '../_shared/functionAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as {
      projectId?: string
      projectToken?: string
      jobId?: string
    }

    const internal = isInternalRequest(req)
    let projectId = body.projectId?.trim() ?? ''
    let projectToken = body.projectToken?.trim() ?? ''

    if (body.jobId) {
      const { data: job } = await supabase
        .from('project_completion_jobs')
        .select('id, project_id, token, processed_at')
        .eq('id', body.jobId)
        .maybeSingle()
      if (!job) return jsonResponse({ error: 'Job not found' }, 404)
      if (job.processed_at) return jsonResponse({ success: true, skipped: true, reason: 'already_processed' })
      projectId = job.project_id
      projectToken = job.token
      if (!internal) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
    }

    if (!projectId || !projectToken) {
      return jsonResponse({ error: 'projectId and projectToken required' }, 400)
    }

    if (!internal) {
      const denied = await assertProjectToken(supabase, projectId, projectToken)
      if (denied) return jsonResponse({ error: denied.error }, denied.status)
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status, token')
      .eq('id', projectId)
      .single()
    if (projectError || !project) return jsonResponse({ error: 'Project not found' }, 404)
    if (project.status !== 'completed') {
      return jsonResponse({ error: 'Project not completed' }, 409)
    }
    if (!internal && project.token !== projectToken) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    const { data: job } = await supabase
      .from('project_completion_jobs')
      .select('id, processed_at')
      .eq('project_id', projectId)
      .maybeSingle()

    if (job?.processed_at) {
      return jsonResponse({ success: true, skipped: true, reason: 'already_processed' })
    }

    const headers = internalSecretHeaders()
    const notify = await supabase.functions.invoke('send-project-completed-notification', {
      body: { projectId, projectToken: project.token },
      headers,
    })
    if (notify.error) {
      console.error('completed notification failed:', notify.error.message)
    }

    const integrations = await supabase.functions.invoke('trigger-integrations', {
      body: { projectId, projectToken: project.token },
      headers,
    })
    if (integrations.error) {
      console.error('trigger-integrations failed:', integrations.error.message)
    }

    if (job?.id) {
      await supabase
        .from('project_completion_jobs')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', job.id)
    } else {
      await supabase.from('project_completion_jobs').upsert(
        {
          project_id: projectId,
          token: project.token,
          processed_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' },
      )
    }

    const results = (integrations.data as { results?: Record<string, unknown> } | null)?.results ?? {}
    return jsonResponse({ success: true, results })
  } catch (error) {
    console.error('process-project-completion:', (error as Error).message)
    return jsonResponse({ error: 'Unavailable' }, 500)
  }
})
