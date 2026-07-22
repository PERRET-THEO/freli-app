/**
 * Envoi d'un brouillon de relance intelligente validé par l'agence.
 *
 * Appelée depuis le dashboard (JWT requis). L'agence a pu éditer l'objet et
 * le corps avant envoi : les valeurs transmises priment sur le brouillon.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { getResendFrom, assertResendOk, isDevMode } from '../_shared/email.ts'
import { buildSmartReminderEmail } from '../_shared/clientEmailHtml.ts'
import { corsHeaders, getAuthenticatedUser, jsonResponse } from '../_shared/functionAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const supabase = createClient(supabaseUrl, serviceRoleKey)
const resend = new Resend(resendApiKey)

type Body = {
  reminderId: string
  subject?: string
  body?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const requestBody = (await req.json()) as Body
    if (!requestBody.reminderId) return jsonResponse({ error: 'reminderId requis' }, 400)

    const { data: reminder, error: reminderError } = await supabase
      .from('smart_reminders')
      .select(
        'id, project_id, agency_id, subject, body, status, agencies(user_id, name), projects(token, client_name, client_email)',
      )
      .eq('id', requestBody.reminderId)
      .single()
    if (reminderError || !reminder) return jsonResponse({ error: 'Relance introuvable' }, 404)

    const agencyRel = reminder.agencies as
      | { user_id?: string; name?: string }
      | { user_id?: string; name?: string }[]
      | null
    const agency = Array.isArray(agencyRel) ? agencyRel[0] : agencyRel
    if (agency?.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403)

    if (reminder.status !== 'draft') {
      return jsonResponse({ error: `Relance déjà traitée (statut : ${reminder.status})` }, 409)
    }

    const projectRel = reminder.projects as
      | { token?: string; client_name?: string; client_email?: string }
      | { token?: string; client_name?: string; client_email?: string }[]
      | null
    const project = Array.isArray(projectRel) ? projectRel[0] : projectRel
    if (!project?.token || !project.client_email) {
      return jsonResponse({ error: 'Projet invalide' }, 400)
    }

    const subject = requestBody.subject?.trim() || reminder.subject
    const bodyText = requestBody.body?.trim() || reminder.body
    const agencyName = agency?.name ?? 'Votre agence'
    const portalUrl = `${appUrl}/p/${project.token}`
    const now = new Date().toISOString()

    let resendEmailId: string | null = null
    if (isDevMode()) {
      console.log('MODE DEV — Relance IA simulée pour:', project.client_email, subject)
    } else {
      const sendResult = await resend.emails.send({
        from: getResendFrom(),
        to: project.client_email,
        subject,
        html: buildSmartReminderEmail({ bodyText, agencyName, portalUrl }),
      })
      assertResendOk(sendResult)
      resendEmailId = (sendResult.data as { id?: string } | null)?.id ?? null
    }

    await supabase
      .from('smart_reminders')
      .update({ subject, body: bodyText, status: 'sent', sent_at: now, resend_email_id: resendEmailId })
      .eq('id', reminder.id)
    await supabase
      .from('projects')
      .update({ last_reminder_sent_at: now })
      .eq('id', reminder.project_id)
    await supabase.from('project_reminder_logs').insert({
      project_id: reminder.project_id,
      agency_id: reminder.agency_id,
      source: 'manual',
      recipient_email: project.client_email,
    })
    if (resendEmailId) {
      await supabase.from('email_events').insert({
        project_id: reminder.project_id,
        resend_email_id: resendEmailId,
        event_type: 'sent',
      })
    }

    return jsonResponse({ success: true, sentAt: now })
  } catch (error) {
    console.error('send-smart-reminder error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
