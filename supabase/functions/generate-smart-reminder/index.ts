/**
 * Génération du CONTENU d'une relance intelligente (Gemini).
 * HTTP entrypoint — délègue au module partagé (même code que request-smart-reminder waitUntil).
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { getResendFrom, assertResendOk, isDevMode } from '../_shared/email.ts'
import { buildSmartReminderEmail } from '../_shared/clientEmailHtml.ts'
import {
  assertUserOwnsProject,
  corsHeaders,
  getAuthenticatedUser,
  isInternalRequest,
  jsonResponse,
} from '../_shared/functionAuth.ts'
import {
  generateSmartReminderDraft,
  type BehaviorCategory,
} from '../_shared/generateSmartReminderDraft.ts'
import { claimAutoReminder, finalizeAutoReminder } from '../_shared/reminderClaim.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const supabase = createClient(supabaseUrl, serviceRoleKey)
const resend = new Resend(resendApiKey)

type Body = {
  projectId: string
  behaviorCategory: BehaviorCategory
  blockingStepLabel?: string
  clientActionLabels?: string[]
  progress?: { completedVisible: number; totalVisible: number; percent: number }
  attemptClaim?: boolean
  reminderId?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as Body
    if (!body.projectId || !body.behaviorCategory) {
      return jsonResponse({ error: 'projectId et behaviorCategory requis' }, 400)
    }

    if (!isInternalRequest(req)) {
      const user = await getAuthenticatedUser(req)
      if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
      const denied = await assertUserOwnsProject(supabase, user.id, body.projectId)
      if (denied) return jsonResponse({ error: denied.error }, denied.status)
    }

    const result = await generateSmartReminderDraft(supabase, {
      projectId: body.projectId,
      behaviorCategory: body.behaviorCategory,
      blockingStepLabel: body.blockingStepLabel,
      clientActionLabels: body.clientActionLabels,
      progress: body.progress,
      reminderId: body.reminderId,
      attemptClaim: body.attemptClaim === true,
    })

    if (!result.ok) {
      if (result.skipped) {
        return jsonResponse({
          skipped: true,
          reason: result.reason,
          code: result.code,
        })
      }
      return jsonResponse({ error: result.reason }, 400)
    }

    if (!result.wantAutoSend) {
      return jsonResponse({
        reminderId: result.reminderId,
        status: 'draft',
        previewRequired: result.previewRequired,
        deferredOutsideWindow: result.deferredOutsideWindow,
      })
    }

    const claim = await claimAutoReminder(supabase, body.projectId)
    if (!claim.ok) {
      return jsonResponse({
        reminderId: result.reminderId,
        status: 'draft',
        claimSkipped: claim.errorCode,
      })
    }

    const portalUrl = `${appUrl}/p/${result.projectToken}`
    try {
      let resendEmailId: string | null = null
      if (isDevMode()) {
        console.log('MODE DEV — Relance IA simulée pour:', result.clientEmail, result.subject)
        resendEmailId = null
      } else {
        const sendResult = await resend.emails.send({
          from: getResendFrom(),
          to: result.clientEmail,
          subject: result.subject,
          html: buildSmartReminderEmail({
            bodyText: result.bodyText,
            agencyName: result.agencyName,
            portalUrl,
          }),
        })
        assertResendOk(sendResult)
        resendEmailId = (sendResult.data as { id?: string } | null)?.id ?? null
      }

      const now = new Date().toISOString()
      await supabase
        .from('smart_reminders')
        .update({
          subject: result.subject,
          body: result.bodyText,
          status: 'sent',
          sent_at: now,
          resend_email_id: resendEmailId,
        })
        .eq('id', result.reminderId)
      await finalizeAutoReminder(supabase, claim.logId, 'sent')
      if (resendEmailId) {
        await supabase.from('email_events').insert({
          project_id: body.projectId,
          resend_email_id: resendEmailId,
          event_type: 'sent',
        })
      } else if (isDevMode()) {
        await supabase.from('email_events').insert({
          project_id: body.projectId,
          resend_email_id: `dev-sim-${result.reminderId}`,
          event_type: 'sent',
        })
      }
      return jsonResponse({
        reminderId: result.reminderId,
        status: 'sent',
        simulated: isDevMode(),
      })
    } catch (sendError) {
      await finalizeAutoReminder(supabase, claim.logId, 'failed')
      throw sendError
    }
  } catch (error) {
    console.error('generate-smart-reminder error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
