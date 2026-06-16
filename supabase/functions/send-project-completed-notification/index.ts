import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { getResendFrom, assertResendOk } from '../_shared/email.ts'
import { buildAgencyCompletedEmail } from '../_shared/clientEmailHtml.ts'
import {
  assertProjectToken,
  corsHeaders,
  jsonResponse,
} from '../_shared/functionAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const supabase = createClient(supabaseUrl, serviceRoleKey)
const resend = new Resend(resendApiKey)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const rawBody = await req.text()

    if (!rawBody || rawBody.trim() === '') {
      return jsonResponse({ error: 'Body vide' }, 400)
    }

    const body = JSON.parse(rawBody) as { projectId?: string; projectToken?: string }

    if (!body.projectId || !body.projectToken) {
      return jsonResponse({ error: 'Missing projectId or projectToken' }, 400)
    }

    const denied = await assertProjectToken(supabase, body.projectId, body.projectToken)
    if (denied) return jsonResponse({ error: denied.error }, denied.status)

    if (appUrl.includes('localhost')) {
      console.log('MODE DEV — Email de notification simulé')
      return jsonResponse({ success: true, message: 'Email simulé en développement' })
    }

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, client_name, agency_id')
      .eq('id', body.projectId)
      .single()
    if (projectError || !projectData) throw new Error('Project not found')

    const { data: agencyData, error: agencyError } = await supabase
      .from('agencies')
      .select('name, user_id')
      .eq('id', projectData.agency_id)
      .single()
    if (agencyError || !agencyData) throw new Error('Agency not found')

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      agencyData.user_id,
    )
    if (userError || !userData.user?.email) throw new Error('Agency user email not found')

    const { data: itemsData } = await supabase
      .from('checklist_items')
      .select('label, completed')
      .eq('project_id', projectData.id)
      .order('order_index', { ascending: true })

    const checklistHtml = (itemsData ?? [])
      .map((item) => {
        const icon = item.completed ? '✅' : '⬜'
        const label = String(item.label)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        return `<li>${icon} ${label}</li>`
      })
      .join('')

    const projectUrl = `${appUrl}/dashboard/project/${projectData.id}`
    const html = buildAgencyCompletedEmail({
      clientName: projectData.client_name,
      checklistHtml,
      projectUrl,
    })

    const result = await resend.emails.send({
      from: getResendFrom(),
      to: userData.user.email,
      subject: `✅ ${projectData.client_name} a complété son onboarding`,
      html,
    })
    console.log('Resend response:', JSON.stringify(result))
    assertResendOk(result)

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('send-project-completed-notification error:', message)
    return jsonResponse({ error: message }, 400)
  }
})
