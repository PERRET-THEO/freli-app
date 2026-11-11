/**
 * Batch des relances classiques (template, sans IA) — cron horaire.
 *
 * - Agences sans IA (module désactivé ou add-on inactif) : relance classique
 *   dès que le délai est écoulé.
 * - Agences en mode IA : smart-reminders-batch est prioritaire (et envoie déjà
 *   le classique en repli). Ce batch ne sert que de filet de sécurité : il
 *   relance un projet IA en retard de plus de AI_FALLBACK_GRACE_HOURS (le batch
 *   IA n'a pas tourné ou a planté).
 *
 * Éligibilité client = ≥ 1 action côté client (getClientPendingActions).
 * Envoi réservé via claim_auto_reminder (délai, plafond, plage Paris,
 * anti-doublon partagé avec les relances IA).
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hasClientPendingActions } from '../_shared/clientPendingActions.ts'
import { claimAutoReminder, finalizeAutoReminder } from '../_shared/reminderClaim.ts'
import { isCronAuthorized } from '../_shared/cronAuth.ts'
import { AI_FALLBACK_GRACE_HOURS, usesAiReminders } from '../_shared/autoReminderRouting.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

type AgencyReminderSettings = {
  auto_reminders_enabled: boolean | null
  ai_reminders_enabled: boolean | null
}

type ProjectRow = {
  id: string
  status: string
  agency_id: string
  agencies: AgencyReminderSettings | AgencyReminderSettings[] | null
}

function agencySettings(project: ProjectRow): AgencyReminderSettings | null {
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
    if (!(await isCronAuthorized(req, supabase))) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, status, agency_id, agencies(auto_reminders_enabled, ai_reminders_enabled)')
      .neq('status', 'completed')

    if (error) {
      throw new Error(error.message)
    }

    const allProjects = (projects ?? []) as ProjectRow[]
    const agencyIds = [...new Set(allProjects.map((p) => p.agency_id).filter(Boolean))]
    const { data: billingRows } = await supabase
      .from('billing_accounts')
      .select('agency_id, ai_addon_active')
      .in('agency_id', agencyIds.length > 0 ? agencyIds : ['00000000-0000-0000-0000-000000000000'])
    const addonByAgency = new Map(
      (billingRows ?? []).map((row) => [row.agency_id as string, row.ai_addon_active === true]),
    )

    let sent = 0
    let safetyNetSent = 0
    let skipped = 0
    let failed = 0
    const candidates = allProjects.filter(
      (project) => agencySettings(project)?.auto_reminders_enabled !== false,
    )

    for (const project of candidates) {
      const aiManaged = usesAiReminders(
        agencySettings(project),
        addonByAgency.get(project.agency_id) === true,
      )

      const { data: itemRows } = await supabase
        .from('checklist_items')
        .select('label, type, completed, value, order_index, review_status, review_note, config')
        .eq('project_id', project.id)
        .order('order_index', { ascending: true })

      if (!hasClientPendingActions(itemRows ?? [])) {
        skipped += 1
        continue
      }

      const claim = await claimAutoReminder(supabase, project.id, {
        graceHours: aiManaged ? AI_FALLBACK_GRACE_HOURS : 0,
      })
      if (!claim.ok) {
        skipped += 1
        continue
      }
      if (aiManaged) {
        console.log('Filet de sécurité : relance classique pour projet IA en retard', project.id)
      }

      try {
        const invokeResult = await supabase.functions.invoke('send-project-invite', {
          body: {
            projectId: project.id,
            reminder: true,
            source: 'auto',
            claimLogId: claim.logId,
          },
          headers: { 'x-cron-secret': cronSecret },
        })
        const payload = invokeResult.data as { error?: string; success?: boolean } | null
        if (invokeResult.error || payload?.error || !payload?.success) {
          console.error(
            'Reminder failed for',
            project.id,
            invokeResult.error?.message ?? payload?.error,
          )
          await finalizeAutoReminder(supabase, claim.logId, 'failed')
          failed += 1
        } else {
          // finalize 'sent' est fait dans send-project-invite quand claimLogId est fourni
          sent += 1
          if (aiManaged) safetyNetSent += 1
        }
      } catch (invokeError) {
        console.error('Reminder failed for', project.id, (invokeError as Error).message)
        await finalizeAutoReminder(supabase, claim.logId, 'failed')
        failed += 1
      }
    }

    const summary = {
      success: true,
      candidates: candidates.length,
      sent,
      safetyNetSent,
      skipped,
      failed,
    }
    console.log('Batch summary:', JSON.stringify(summary))

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
