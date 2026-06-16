import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { getResendFrom, assertResendOk } from '../_shared/email.ts'
import { buildClientOnboardingEmail, isValidProjectToken } from '../_shared/clientEmailHtml.ts'
import {
  buildProjectPayload,
  fireOutgoingWebhooks,
  getAgencyUserId,
} from '../_shared/outgoingWebhooks.ts'
import {
  assertProjectToken,
  assertUserOwnsProject,
  corsHeaders,
  getAuthenticatedUser,
  isInternalRequest,
  jsonResponse,
} from '../_shared/functionAuth.ts'

type InviteBody = {
  projectId?: string
  projectToken?: string
  token?: string
  clientName?: string
  clientEmail?: string
  agencyName?: string
  reminder?: boolean
  mode?: 'reminder' | 'invite'
  source?: 'auto' | 'manual'
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const supabase = createClient(supabaseUrl, serviceRoleKey)
const resend = new Resend(resendApiKey)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let body: InviteBody
    try {
      const rawBody = await req.text()
      if (!rawBody || rawBody.trim() === '') {
        return jsonResponse({ error: 'Body vide reçu' }, 400)
      }
      body = JSON.parse(rawBody) as InviteBody
    } catch (e) {
      const parseMessage = e instanceof Error ? e.message : String(e)
      return jsonResponse({ error: `JSON invalide: ${parseMessage}` }, 400)
    }

    const isDev = appUrl.includes('localhost')
    const isReminderMode = body.mode === 'reminder' || body.reminder === true
    const emailMode: 'invite' | 'reminder' = isReminderMode ? 'reminder' : 'invite'
    const reminderSource = body.source === 'manual' ? 'manual' : 'auto'

    let projectId = body.projectId
    let token = body.token ?? body.projectToken
    let clientName = body.clientName
    let clientEmail = body.clientEmail
    let agencyName = body.agencyName ?? 'Mon Agence'
    let agencyId: string | null = null
    let projectRow: {
      id: string
      token: string
      client_name: string
      client_email: string
      agency_id: string
      status: string | null
      price: number | null
      payment_status: string | null
    } | null = null

    if (!projectId) {
      return jsonResponse({ error: 'Missing projectId' }, 400)
    }

    const internal = isInternalRequest(req)
    if (!internal) {
      const user = await getAuthenticatedUser(req)
      if (user) {
        const denied = await assertUserOwnsProject(supabase, user.id, projectId)
        if (denied) return jsonResponse({ error: denied.error }, denied.status)
      } else if (body.projectToken || body.token) {
        const projectToken = body.projectToken ?? body.token ?? ''
        const denied = await assertProjectToken(supabase, projectId, projectToken)
        if (denied) return jsonResponse({ error: denied.error }, denied.status)
      } else {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
    }

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, token, client_name, client_email, agency_id, status, price, payment_status, agencies(id, name)')
      .eq('id', projectId)
      .single()
    if (projectError || !projectData) throw new Error('Project not found')

    projectRow = projectData
    token = projectData.token
    clientName = projectData.client_name
    clientEmail = projectData.client_email
    agencyId = projectData.agency_id
    const agenciesRel = projectData.agencies as { id?: string; name?: string } | { id?: string; name?: string }[] | null
    const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
    if (agencyRow?.name) agencyName = agencyRow.name

    if (!token || !clientName || !clientEmail) {
      throw new Error('Missing invite payload')
    }

    if (!isValidProjectToken(token)) {
      throw new Error('Invalid project token')
    }

    const portalUrl = `${appUrl}/p/${token}`

    if (isDev) {
      console.log('MODE DEV — Email simulé pour:', clientEmail, portalUrl)
      return jsonResponse({
        success: true,
        message: 'Email simulé en développement',
        recipient: clientEmail,
        portalUrl,
      })
    }

    const subject = isReminderMode
      ? `${agencyName} — rappel : votre onboarding est en attente`
      : `${agencyName} vous invite à compléter votre onboarding`

    const html = buildClientOnboardingEmail({
      mode: emailMode,
      clientName,
      agencyName,
      portalUrl,
    })

    const result = await resend.emails.send({
      from: getResendFrom(),
      to: clientEmail,
      subject,
      html,
    })
    console.log('Resend response:', JSON.stringify(result))
    assertResendOk(result)

    if (isReminderMode && projectId) {
      await supabase
        .from('projects')
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq('id', projectId)

      await supabase.from('project_reminder_logs').insert({
        project_id: projectId,
        agency_id: agencyId,
        source: reminderSource,
        recipient_email: clientEmail,
      })
    }

    if (projectId && agencyId && projectRow) {
      const userId = await getAgencyUserId(supabase, agencyId)
      if (userId) {
        const webhookEvent = isReminderMode ? 'project.reminder_sent' : 'project.created'
        fireOutgoingWebhooks(
          supabase,
          userId,
          webhookEvent,
          buildProjectPayload(
            projectRow,
            { id: agencyId, name: agencyName },
            {
              meta: {
                source: isReminderMode ? reminderSource : 'invite',
                portal_url: portalUrl,
              },
            },
          ),
        )
      }
    }

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('Error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
