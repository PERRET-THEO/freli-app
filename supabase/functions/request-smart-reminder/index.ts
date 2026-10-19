/**
 * Déclenchement manuel d'une relance intelligente depuis le dashboard.
 * Catégorise le comportement puis invoque generate-smart-reminder.
 *
 * Si un brouillon existe déjà : le retourne sans régénérer (sauf forceRefresh).
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assertUserOwnsProject,
  corsHeaders,
  getAuthenticatedUser,
  internalSecretHeaders,
  jsonResponse,
} from '../_shared/functionAuth.ts'
import { resolveProjectBehavior } from '../_shared/resolveProjectBehavior.ts'
import { draftStaleReason } from '../_shared/smartReminderDraft.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

type Body = {
  projectId: string
  /** Si true, dismiss le draft existant et régénère. */
  forceRefresh?: boolean
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = (await req.json()) as Body
    if (!body.projectId) return jsonResponse({ error: 'projectId requis' }, 400)

    const denied = await assertUserOwnsProject(supabase, user.id, body.projectId)
    if (denied) return jsonResponse({ error: denied.error }, denied.status)

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, created_at, last_portal_visit_at, agency_id, status, agencies(ai_reminders_enabled)',
      )
      .eq('id', body.projectId)
      .single()
    if (projectError || !project) return jsonResponse({ error: 'Projet introuvable' }, 404)

    const agencyRel = project.agencies as
      | { ai_reminders_enabled?: boolean | null }
      | { ai_reminders_enabled?: boolean | null }[]
      | null
    const agency = Array.isArray(agencyRel) ? agencyRel[0] : agencyRel
    if (agency?.ai_reminders_enabled !== true) {
      return jsonResponse({ error: 'Module relances IA désactivé', code: 'ai_reminders_disabled' }, 400)
    }

    if (project.status === 'completed') {
      return jsonResponse({ error: 'Projet déjà terminé' }, 400)
    }

    const behavior = await resolveProjectBehavior(supabase, {
      id: project.id,
      last_portal_visit_at: project.last_portal_visit_at,
      created_at: project.created_at,
    })

    if (behavior.clientActionLabels.length === 0) {
      return jsonResponse(
        { error: 'Aucune action côté client — rien à relancer' },
        400,
      )
    }

    const { data: existingDraft } = await supabase
      .from('smart_reminders')
      .select(
        'id, behavior_category, subject, status, blocking_step_label, prompt_version',
      )
      .eq('project_id', project.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingDraft) {
      const reason = draftStaleReason(existingDraft, behavior.clientActionLabels)
      if (reason) {
        await supabase
          .from('smart_reminders')
          .update({ status: 'stale' })
          .eq('id', existingDraft.id)
      } else if (!body.forceRefresh) {
        return jsonResponse({
          reminderId: existingDraft.id,
          status: 'draft',
          existing: true,
          message: 'Un brouillon est déjà en attente de validation.',
        })
      } else {
        await supabase
          .from('smart_reminders')
          .update({ status: 'dismissed' })
          .eq('id', existingDraft.id)
      }
    }

    const invokeResult = await supabase.functions.invoke('generate-smart-reminder', {
      body: {
        projectId: project.id,
        behaviorCategory: behavior.behaviorCategory,
        blockingStepLabel: behavior.blockingStepLabel,
        clientActionLabels: behavior.clientActionLabels,
        progress: behavior.progress,
      },
      headers: internalSecretHeaders(),
    })

    type GeneratePayload = {
      error?: string
      skipped?: boolean
      reason?: string
      code?: string
      reminderId?: string
      status?: string
      previewRequired?: boolean
    }

    let payload = invokeResult.data as GeneratePayload | null

    // FunctionsHttpError : le body JSON de generate est souvent dans error.context.
    if (invokeResult.error && (!payload || !payload.error)) {
      const ctx = (invokeResult.error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        try {
          const nested = (await ctx.json()) as GeneratePayload
          if (nested && typeof nested === 'object') {
            payload = { ...nested, ...payload }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (invokeResult.error || payload?.error) {
      return jsonResponse(
        {
          error:
            payload?.error ??
            invokeResult.error?.message ??
            'Génération échouée',
        },
        400,
      )
    }

    if (payload?.skipped) {
      return jsonResponse(
        {
          skipped: true,
          reason: payload.reason ?? 'Génération ignorée',
          code: payload.code,
        },
        400,
      )
    }

    return jsonResponse({
      reminderId: payload?.reminderId,
      status: payload?.status ?? 'draft',
      previewRequired: payload?.previewRequired === true,
      behaviorCategory: behavior.behaviorCategory,
      existing: false,
    })
  } catch (error) {
    console.error('request-smart-reminder error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
