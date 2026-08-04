/**
 * Moteur de règles des relances intelligentes (cron quotidien).
 *
 * Décision 100 % déterministe — l'IA ne choisit JAMAIS si ni quand relancer,
 * elle ne rédige que le contenu (generate-smart-reminder) :
 *   1. Projet non terminé, checklist incomplète, module IA activé.
 *   2. Délai agence écoulé depuis la dernière activité (création, relance,
 *      visite portail).
 *   3. Plafond de relances par projet respecté (anti-harcèlement).
 *   4. Catégorisation par comportement observé :
 *      - aucun email ouvert            → not_opened
 *      - ouvert mais portail non visité → opened_not_clicked
 *      - portail visité, étape bloquante → stuck_on_step
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

const DEFAULT_DELAY_HOURS = 48
const DEFAULT_MAX_PER_PROJECT = 3

type AgencySettings = {
  ai_reminders_enabled: boolean | null
  auto_reminders_delay_hours: number | null
  ai_reminder_max_per_project: number | null
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

function delayHoursFor(project: ProjectRow): number {
  const raw = settingsFor(project)?.auto_reminders_delay_hours
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 12) return Math.round(raw)
  return DEFAULT_DELAY_HOURS
}

function maxRemindersFor(project: ProjectRow): number {
  const raw = settingsFor(project)?.ai_reminder_max_per_project
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) return Math.round(raw)
  return DEFAULT_MAX_PER_PROJECT
}

/** Plage horaire Europe/Paris — hors plage = skip (réessai au prochain cron). */
function isWithinSendWindow(project: ProjectRow, now: Date): boolean {
  const settings = settingsFor(project)
  const start = typeof settings?.ai_reminder_send_hour_start === 'number'
    ? settings.ai_reminder_send_hour_start
    : 9
  const end = typeof settings?.ai_reminder_send_hour_end === 'number'
    ? settings.ai_reminder_send_hour_end
    : 19
  const parisHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  )
  if (start === end) return true
  if (start < end) return parisHour >= start && parisHour < end
  // fenêtre traversant minuit
  return parisHour >= start || parisHour < end
}

/** Délai écoulé depuis la dernière activité connue (création, relance, visite). */
function isDelayElapsed(project: ProjectRow, nowMs: number): boolean {
  const delayMs = delayHoursFor(project) * 60 * 60 * 1000
  const lastActivityMs = Math.max(
    new Date(project.created_at).getTime(),
    project.last_reminder_sent_at ? new Date(project.last_reminder_sent_at).getTime() : 0,
    project.last_portal_visit_at ? new Date(project.last_portal_visit_at).getTime() : 0,
  )
  return nowMs - lastActivityMs > delayMs
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
    const now = new Date(nowMs)

    const { data: projects, error } = await supabase
      .from('projects')
      .select(
        'id, created_at, status, last_reminder_sent_at, last_portal_visit_at, agency_id, agencies(ai_reminders_enabled, auto_reminders_delay_hours, ai_reminder_max_per_project, ai_reminder_send_hour_start, ai_reminder_send_hour_end)',
      )
      .neq('status', 'completed')
    if (error) throw new Error(error.message)

    let generated = 0
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
      if (settingsFor(project)?.ai_reminders_enabled !== true) return false
      return addonByAgency.get(project.agency_id) === true
    })

    for (const project of candidates) {
      if (!isWithinSendWindow(project, now)) {
        skipped += 1
        continue
      }

      if (!isDelayElapsed(project, nowMs)) {
        skipped += 1
        continue
      }

      // Checklist : ne relancer que s'il reste des étapes
      const { data: itemRows } = await supabase
        .from('checklist_items')
        .select('label, completed, order_index')
        .eq('project_id', project.id)
        .order('order_index', { ascending: true })
      const items = itemRows ?? []
      const firstIncomplete = items.find((item) => !item.completed)
      if (items.length === 0 || !firstIncomplete) {
        skipped += 1
        continue
      }

      // Plafond anti-harcèlement (relances IA envoyées sur ce projet)
      const { count: sentCount } = await supabase
        .from('smart_reminders')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('status', 'sent')
      if ((sentCount ?? 0) >= maxRemindersFor(project)) {
        skipped += 1
        continue
      }

      // Un brouillon en attente de validation suffit : pas d'empilement
      const { count: draftCount } = await supabase
        .from('smart_reminders')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('status', 'draft')
      if ((draftCount ?? 0) > 0) {
        skipped += 1
        continue
      }

      // Catégorisation comportementale (règles vérifiables, aucune IA)
      const hasVisitedPortal =
        project.last_portal_visit_at !== null || items.some((item) => item.completed)
      let behaviorCategory: 'not_opened' | 'opened_not_clicked' | 'stuck_on_step'
      let blockingStepLabel: string | undefined

      if (hasVisitedPortal) {
        behaviorCategory = 'stuck_on_step'
        blockingStepLabel = firstIncomplete.label
      } else {
        const { count: openedCount } = await supabase
          .from('email_events')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project.id)
          .eq('event_type', 'opened')
        behaviorCategory = (openedCount ?? 0) > 0 ? 'opened_not_clicked' : 'not_opened'
      }

      try {
        const invokeResult = await supabase.functions.invoke('generate-smart-reminder', {
          body: { projectId: project.id, behaviorCategory, blockingStepLabel },
          headers: { 'x-cron-secret': cronSecret },
        })
        const payload = invokeResult.data as { error?: string; status?: string } | null
        if (invokeResult.error || payload?.error) {
          console.error(
            'Smart reminder failed for',
            project.id,
            invokeResult.error?.message ?? payload?.error,
          )
          failed += 1
        } else {
          generated += 1
        }
      } catch (invokeError) {
        console.error('Smart reminder failed for', project.id, (invokeError as Error).message)
        failed += 1
      }
    }

    const summary = { success: true, candidates: candidates.length, generated, skipped, failed }
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
