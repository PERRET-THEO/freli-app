/**
 * Déclenchement manuel d'une relance intelligente depuis le dashboard.
 *
 * mode async : crée un placeholder `generating`, répond immédiatement,
 * génère in-process dans waitUntil (module partagé — pas de fetch inter-EF).
 * Crédit débité uniquement au succès.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assertUserOwnsProject,
  corsHeaders,
  getAuthenticatedUser,
  jsonResponse,
} from '../_shared/functionAuth.ts'
import { resolveProjectBehavior } from '../_shared/resolveProjectBehavior.ts'
import { draftStaleReason } from '../_shared/smartReminderDraft.ts'
import {
  generateSmartReminderDraft,
  type BehaviorCategory,
} from '../_shared/generateSmartReminderDraft.ts'

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void }

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

type Body = {
  projectId: string
  forceRefresh?: boolean
  async?: boolean
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

    const { data: existingGenerating } = await supabase
      .from('smart_reminders')
      .select('id, created_at, generating_started_at')
      .eq('project_id', project.id)
      .eq('status', 'generating')
      .maybeSingle()

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

    const generateArgs = {
      projectId: project.id,
      behaviorCategory: behavior.behaviorCategory as BehaviorCategory,
      blockingStepLabel: behavior.blockingStepLabel,
      clientActionLabels: behavior.clientActionLabels,
      progress: behavior.progress,
    }

    if (body.async) {
      const startedAt = new Date().toISOString()
      let placeholderId: string | null = existingGenerating?.id ?? null
      let existing = Boolean(existingGenerating)
      let shouldKickBackground = true

      if (placeholderId) {
        const startedMs = existingGenerating?.generating_started_at
          ? new Date(existingGenerating.generating_started_at).getTime()
          : existingGenerating?.created_at
            ? new Date(existingGenerating.created_at).getTime()
            : 0
        // Job encore jeune (< 90 s) : ne pas double-générer.
        if (startedMs && Date.now() - startedMs < 90_000) {
          shouldKickBackground = false
        } else {
          await supabase
            .from('smart_reminders')
            .update({ generating_started_at: startedAt })
            .eq('id', placeholderId)
            .eq('status', 'generating')
        }
      } else {
        const { data: placeholder, error: placeholderError } = await supabase
          .from('smart_reminders')
          .insert({
            project_id: project.id,
            agency_id: project.agency_id,
            behavior_category: behavior.behaviorCategory,
            blocking_step_label:
              behavior.blockingStepLabel ?? behavior.clientActionLabels[0] ?? null,
            subject: 'Brouillon en préparation…',
            body: 'Génération en cours.',
            status: 'generating',
            generating_started_at: startedAt,
          })
          .select('id')
          .single()

        if (placeholderError || !placeholder) {
          const { data: again } = await supabase
            .from('smart_reminders')
            .select('id, generating_started_at')
            .eq('project_id', project.id)
            .eq('status', 'generating')
            .maybeSingle()
          if (again) {
            placeholderId = again.id
            existing = true
            const againStarted = again.generating_started_at
              ? new Date(again.generating_started_at).getTime()
              : 0
            if (againStarted && Date.now() - againStarted < 90_000) {
              shouldKickBackground = false
            } else {
              await supabase
                .from('smart_reminders')
                .update({ generating_started_at: startedAt })
                .eq('id', again.id)
                .eq('status', 'generating')
            }
          } else {
            return jsonResponse(
              { error: placeholderError?.message ?? 'Placeholder impossible' },
              400,
            )
          }
        } else {
          placeholderId = placeholder.id
        }
      }

      const reminderId = placeholderId!
      if (shouldKickBackground) {
        const background = (async () => {
          const t0 = Date.now()
          try {
            console.log(
              `request-smart-reminder: in-process generate start reminderId=${reminderId}`,
            )
            const result = await generateSmartReminderDraft(supabase, {
              ...generateArgs,
              reminderId,
              attemptClaim: false,
            })
            if (!result.ok) {
              await supabase
                .from('smart_reminders')
                .update({ status: 'stale' })
                .eq('id', reminderId)
                .eq('status', 'generating')
              console.error(
                'request-smart-reminder async generate failed:',
                result.reason,
                result.code,
                `durationMs=${Date.now() - t0}`,
              )
              return
            }
            console.log(
              `request-smart-reminder: draft ready reminderId=${result.reminderId} durationMs=${Date.now() - t0}`,
            )
          } catch (error) {
            console.error(
              'request-smart-reminder async error:',
              (error as Error).message,
              `durationMs=${Date.now() - t0}`,
            )
            await supabase
              .from('smart_reminders')
              .update({ status: 'stale' })
              .eq('id', reminderId)
              .eq('status', 'generating')
          }
        })()

        try {
          EdgeRuntime.waitUntil(background)
        } catch {
          // Environnements sans EdgeRuntime : fire-and-forget.
          void background
        }
      }

      return jsonResponse({
        accepted: true,
        reminderId,
        status: 'generating',
        existing,
        creditsNote: '1 crédit IA sera consommé si la génération réussit',
      })
    }

    // Sync : même module, pas de HTTP.
    const result = await generateSmartReminderDraft(supabase, {
      ...generateArgs,
      attemptClaim: false,
    })

    if (!result.ok) {
      if (result.skipped) {
        return jsonResponse(
          {
            skipped: true,
            reason: result.reason,
            code: result.code,
          },
          400,
        )
      }
      return jsonResponse({ error: result.reason }, 400)
    }

    return jsonResponse({
      reminderId: result.reminderId,
      status: 'draft',
      previewRequired: result.previewRequired,
      behaviorCategory: behavior.behaviorCategory,
      existing: false,
    })
  } catch (error) {
    console.error('request-smart-reminder error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
