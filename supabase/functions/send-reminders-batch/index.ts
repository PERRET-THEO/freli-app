import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

const DEFAULT_DELAY_HOURS = 48

type AgencyReminderSettings = {
  auto_reminders_enabled: boolean | null
  auto_reminders_delay_hours: number | null
  ai_reminders_enabled: boolean | null
}

type ProjectRow = {
  id: string
  created_at: string
  status: string
  last_reminder_sent_at: string | null
  agency_id: string
  agencies: AgencyReminderSettings | AgencyReminderSettings[] | null
}

function agencySettings(project: ProjectRow): AgencyReminderSettings | null {
  const rel = project.agencies
  if (!rel) return null
  return Array.isArray(rel) ? rel[0] ?? null : rel
}

function delayHoursFor(project: ProjectRow): number {
  const settings = agencySettings(project)
  const raw = settings?.auto_reminders_delay_hours
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 12) return Math.round(raw)
  return DEFAULT_DELAY_HOURS
}

function isEligibleForReminder(project: ProjectRow, nowMs: number): boolean {
  const settings = agencySettings(project)
  if (settings?.auto_reminders_enabled === false) return false
  // Les agences en relances IA sortent du circuit classique (pas de doublon)
  if (settings?.ai_reminders_enabled === true) return false

  const delayMs = delayHoursFor(project) * 60 * 60 * 1000
  const thresholdMs = nowMs - delayMs
  const createdAtMs = new Date(project.created_at).getTime()
  if (createdAtMs >= thresholdMs) return false

  if (project.last_reminder_sent_at) {
    const lastReminderMs = new Date(project.last_reminder_sent_at).getTime()
    if (lastReminderMs >= thresholdMs) return false
  }

  return true
}

serve(async (req) => {
  try {
    // Le batch n'est appelé que par le cron : on exige un secret partagé.
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

    const { data: projects, error } = await supabase
      .from('projects')
      .select(
        'id, created_at, status, last_reminder_sent_at, agency_id, agencies(auto_reminders_enabled, auto_reminders_delay_hours, ai_reminders_enabled)',
      )
      .neq('status', 'completed')

    if (error) {
      throw new Error(error.message)
    }

    let sent = 0
    let skipped = 0
    let failed = 0
    const candidates = (projects ?? []) as ProjectRow[]

    for (const project of candidates) {
      if (!isEligibleForReminder(project, nowMs)) {
        skipped += 1
        continue
      }

      // Ne pas relancer si la checklist est déjà entièrement complétée.
      const { count: pendingCount } = await supabase
        .from('checklist_items')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('completed', false)

      if ((pendingCount ?? 0) === 0) {
        skipped += 1
        continue
      }

      try {
        const invokeResult = await supabase.functions.invoke('send-project-invite', {
          body: { projectId: project.id, reminder: true, source: 'auto' },
          headers: { 'x-cron-secret': cronSecret },
        })
        const payload = invokeResult.data as { error?: string; success?: boolean } | null
        if (invokeResult.error || payload?.error || !payload?.success) {
          console.error('Reminder failed for', project.id, invokeResult.error?.message ?? payload?.error)
          failed += 1
        } else {
          sent += 1
        }
      } catch (invokeError) {
        console.error('Reminder failed for', project.id, (invokeError as Error).message)
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
