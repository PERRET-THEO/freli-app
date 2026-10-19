/**
 * Batch relances template (cron).
 * Éligibilité client = ≥ 1 action côté client (getClientPendingActions).
 * Envoi réservé via claim_auto_reminder (délai, plafond, plage Paris).
 * Les agences IA sortent de ce circuit (smart-reminders-batch).
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hasClientPendingActions } from '../_shared/clientPendingActions.ts'
import { claimAutoReminder, finalizeAutoReminder } from '../_shared/reminderClaim.ts'

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

function isAgencyCandidate(project: ProjectRow): boolean {
  const settings = agencySettings(project)
  if (settings?.auto_reminders_enabled === false) return false
  if (settings?.ai_reminders_enabled === true) return false
  return true
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

    const { data: projects, error } = await supabase
      .from('projects')
      .select(
        'id, status, agency_id, agencies(auto_reminders_enabled, ai_reminders_enabled)',
      )
      .neq('status', 'completed')

    if (error) {
      throw new Error(error.message)
    }

    let sent = 0
    let skipped = 0
    let failed = 0
    const candidates = ((projects ?? []) as ProjectRow[]).filter(isAgencyCandidate)

    for (const project of candidates) {
      const { data: itemRows } = await supabase
        .from('checklist_items')
        .select('label, type, completed, value, order_index, review_status, review_note, config')
        .eq('project_id', project.id)
        .order('order_index', { ascending: true })

      if (!hasClientPendingActions(itemRows ?? [])) {
        skipped += 1
        continue
      }

      const claim = await claimAutoReminder(supabase, project.id)
      if (!claim.ok) {
        skipped += 1
        continue
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
        }
      } catch (invokeError) {
        console.error('Reminder failed for', project.id, (invokeError as Error).message)
        await finalizeAutoReminder(supabase, claim.logId, 'failed')
        failed += 1
      }
    }

    const summary = { success: true, candidates: candidates.length, sent, skipped, failed }
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
