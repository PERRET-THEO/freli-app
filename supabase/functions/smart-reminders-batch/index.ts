/**
 * Moteur de règles des relances intelligentes (cron).
 *
 * Décision déterministe — l'IA ne choisit JAMAIS si ni quand relancer :
 *   1. Module IA + auto + add-on actifs, checklist avec ≥ 1 action client.
 *   2. claim_auto_reminder (délai, plafond consécutif, plage Paris) avant tout envoi.
 *   3. Catégorisation comportementale → brouillon ou envoi draft existant.
 *
 * La génération de brouillon (hors plage / 1ère relance) ne claim pas.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hasClientPendingActions } from '../_shared/clientPendingActions.ts'
import { resolveProjectBehavior } from '../_shared/resolveProjectBehavior.ts'
import { claimAutoReminder, finalizeAutoReminder } from '../_shared/reminderClaim.ts'
import {
  DRAFT_STALE_HOURS,
  isWithinParisSendWindow,
} from '../_shared/smartReminderBehavior.ts'
import { draftStaleReason } from '../_shared/smartReminderDraft.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

type AgencySettings = {
  ai_reminders_enabled: boolean | null
  auto_reminders_enabled: boolean | null
  ai_reminder_auto_send: boolean | null
  ai_reminder_send_hour_start: number | null
  ai_reminder_send_hour_end: number | null
}

type ProjectRow = {
  id: string
  created_at: string
  status: string
  last_reminder_sent_at: string | null
  last_portal_visit_at: string | null
  agency_id: string
  agencies: AgencySettings | AgencySettings[] | null
}

function settingsFor(project: ProjectRow): AgencySettings | null {
  const rel = project.agencies
  if (!rel) return null
  return Array.isArray(rel) ? rel[0] ?? null : rel
}

serve(async (req) => {
  try {
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: 'CRON_SECRET non configuré' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (req.headers.get('x-cron-secret') !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const nowMs = Date.now()
    const staleMs = DRAFT_STALE_HOURS * 60 * 60 * 1000
    const now = new Date(nowMs)

    const { data: projects, error } = await supabase
      .from('projects')
      .select(
        'id, created_at, status, last_reminder_sent_at, last_portal_visit_at, agency_id, agencies(ai_reminders_enabled, auto_reminders_enabled, ai_reminder_auto_send, ai_reminder_send_hour_start, ai_reminder_send_hour_end)',
      )
      .neq('status', 'completed')
    if (error) throw new Error(error.message)

    let generated = 0
    let sent = 0
    let skipped = 0
    let failed = 0

    const agencyIds = [
      ...new Set(((projects ?? []) as ProjectRow[]).map((p) => p.agency_id).filter(Boolean)),
    ]
    const { data: billingRows } = await supabase
      .from('billing_accounts')
      .select('agency_id, ai_addon_active')
      .in('agency_id', agencyIds.length > 0 ? agencyIds : ['00000000-0000-0000-0000-000000000000'])
    const addonByAgency = new Map(
      (billingRows ?? []).map((row) => [row.agency_id as string, row.ai_addon_active === true]),
    )

    const candidates = ((projects ?? []) as ProjectRow[]).filter((project) => {
      const settings = settingsFor(project)
      if (settings?.ai_reminders_enabled !== true) return false
      if (settings?.auto_reminders_enabled === false) return false
      return addonByAgency.get(project.agency_id) === true
    })

    for (const project of candidates) {
      const { data: itemRows } = await supabase
        .from('checklist_items')
        .select(
          'label, type, completed, value, order_index, review_status, review_note, config, submitted_at, reviewed_at',
        )
        .eq('project_id', project.id)
        .order('order_index', { ascending: true })

      if (!hasClientPendingActions(itemRows ?? [])) {
        skipped += 1
        continue
      }

      const behavior = await resolveProjectBehavior(supabase, {
        id: project.id,
        last_portal_visit_at: project.last_portal_visit_at,
        created_at: project.created_at,
        items: itemRows ?? [],
      })

      const { data: draftRows } = await supabase
        .from('smart_reminders')
        .select(
          'id, behavior_category, created_at, status, blocking_step_label, prompt_version',
        )
        .eq('project_id', project.id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)

      let existingDraft = draftRows?.[0] ?? null
      if (existingDraft) {
        const reason = draftStaleReason(existingDraft, behavior.clientActionLabels)
        if (reason) {
          await supabase
            .from('smart_reminders')
            .update({ status: 'stale' })
            .eq('id', existingDraft.id)
          existingDraft = null
        }
      }

      const settings = settingsFor(project)
      const autoSend = settings?.ai_reminder_auto_send === true
      const sendHourStart =
        typeof settings?.ai_reminder_send_hour_start === 'number'
          ? settings.ai_reminder_send_hour_start
          : 9
      const sendHourEnd =
        typeof settings?.ai_reminder_send_hour_end === 'number'
          ? settings.ai_reminder_send_hour_end
          : 19
      const withinWindow = isWithinParisSendWindow(now, sendHourStart, sendHourEnd)

      const { count: priorSent } = await supabase
        .from('smart_reminders')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('status', 'sent')
      const hasPriorSent = (priorSent ?? 0) >= 1

      if (existingDraft) {
        // Auto-send d'un draft existant (après 1ère validation manuelle).
        if (autoSend && withinWindow && hasPriorSent) {
          const claim = await claimAutoReminder(supabase, project.id)
          if (!claim.ok) {
            skipped += 1
            continue
          }
          try {
            const sendResult = await supabase.functions.invoke('send-smart-reminder', {
              body: { reminderId: existingDraft.id, claimLogId: claim.logId },
              headers: { 'x-cron-secret': cronSecret },
            })
            const sendPayload = sendResult.data as { error?: string; success?: boolean } | null
            if (sendResult.error || sendPayload?.error || !sendPayload?.success) {
              console.error(
                'Auto-send draft failed for',
                project.id,
                sendResult.error?.message ?? sendPayload?.error,
              )
              await finalizeAutoReminder(supabase, claim.logId, 'failed')
              failed += 1
            } else {
              sent += 1
            }
          } catch (sendError) {
            console.error('Auto-send draft failed for', project.id, (sendError as Error).message)
            await finalizeAutoReminder(supabase, claim.logId, 'failed')
            failed += 1
          }
          continue
        }

        const draftAgeMs = nowMs - new Date(existingDraft.created_at).getTime()
        const categoryChanged = existingDraft.behavior_category !== behavior.behaviorCategory
        const isStale = draftAgeMs > staleMs
        if (!categoryChanged && !isStale) {
          skipped += 1
          continue
        }
        await supabase
          .from('smart_reminders')
          .update({ status: 'dismissed' })
          .eq('id', existingDraft.id)
      }

      // Génération de brouillon (claim uniquement si generate auto-envoie).
      try {
        const invokeResult = await supabase.functions.invoke('generate-smart-reminder', {
          body: {
            projectId: project.id,
            behaviorCategory: behavior.behaviorCategory,
            blockingStepLabel: behavior.blockingStepLabel,
            clientActionLabels: behavior.clientActionLabels,
            progress: behavior.progress,
            attemptClaim: autoSend && hasPriorSent && withinWindow,
          },
          headers: { 'x-cron-secret': cronSecret },
        })
        const payload = invokeResult.data as {
          error?: string
          skipped?: boolean
          status?: string
        } | null
        if (invokeResult.error || payload?.error) {
          console.error(
            'Smart reminder failed for',
            project.id,
            invokeResult.error?.message ?? payload?.error,
          )
          failed += 1
        } else if (payload?.skipped) {
          skipped += 1
        } else if (payload?.status === 'sent') {
          sent += 1
          generated += 1
        } else {
          generated += 1
        }
      } catch (invokeError) {
        console.error('Smart reminder failed for', project.id, (invokeError as Error).message)
        failed += 1
      }
    }

    const summary = {
      success: true,
      candidates: candidates.length,
      generated,
      sent,
      skipped,
      failed,
    }
    console.log('Smart batch summary:', JSON.stringify(summary))
    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
