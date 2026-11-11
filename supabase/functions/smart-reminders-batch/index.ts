/**
 * Batch des relances automatiques pour les agences en mode IA (cron horaire).
 *
 * Décision déterministe — l'IA ne choisit JAMAIS si ni quand relancer :
 *   1. Agence IA (module activé + add-on actif), relances auto actives,
 *      checklist avec ≥ 1 action client, plafond non atteint.
 *   2. claim_auto_reminder (délai, plafond, plage Paris, anti-doublon) : si le
 *      projet est dû, la réservation est prise AVANT tout envoi.
 *   3. Projet dû : l'IA est prioritaire. Si elle ne peut pas envoyer (1ère
 *      relance non validée, envoi auto IA désactivé, Gemini en échec / timeout,
 *      crédits épuisés…), la relance classique part sur la même réservation.
 *      → toujours une relance, jamais deux.
 *   4. Projets pas encore dus : préparation des brouillons IA s'il reste du temps.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hasClientPendingActions } from '../_shared/clientPendingActions.ts'
import { resolveProjectBehavior } from '../_shared/resolveProjectBehavior.ts'
import { claimAutoReminder, finalizeAutoReminder } from '../_shared/reminderClaim.ts'
import { DRAFT_STALE_HOURS } from '../_shared/smartReminderBehavior.ts'
import { draftStaleReason } from '../_shared/smartReminderDraft.ts'
import { isCronAuthorized } from '../_shared/cronAuth.ts'
import {
  afterAiGeneration,
  afterAiSend,
  planDueReminder,
  runWithConcurrency,
  usesAiReminders,
} from '../_shared/autoReminderRouting.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

/**
 * Budget temps : une Edge Function est coupée à ~150 s. Pire cas d'un projet dû
 * démarré à DUE_START_BUDGET_MS : génération (si < AI_START_BUDGET_MS) + envoi IA
 * + repli classique ≈ 50 + 35 + 15 + 15 = 115 s.
 */
const DUE_START_BUDGET_MS = 70_000
const AI_START_BUDGET_MS = 50_000
const PREGEN_START_BUDGET_MS = 60_000
const GEN_TIMEOUT_MS = 35_000
const SEND_TIMEOUT_MS = 15_000
const CONCURRENCY = 4

type InvokeResult = { data: unknown; error: { message: string } | null; timedOut: boolean }

async function invokeWithTimeout(
  fn: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<InvokeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { error: text.slice(0, 200) }
    }
    if (!res.ok) {
      const message =
        (data as { error?: string } | null)?.error ?? `Edge Function returned HTTP ${res.status}`
      return { data, error: { message }, timedOut: false }
    }
    return { data, error: null, timedOut: false }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return { data: null, error: { message: `timeout après ${timeoutMs} ms` }, timedOut: true }
    }
    return { data: null, error: { message: (error as Error).message }, timedOut: false }
  } finally {
    clearTimeout(timer)
  }
}

type AgencySettings = {
  ai_reminders_enabled: boolean | null
  auto_reminders_enabled: boolean | null
  ai_reminder_auto_send: boolean | null
  ai_reminder_max_per_project: number | null
}

type ProjectRow = {
  id: string
  created_at: string
  status: string
  last_portal_visit_at: string | null
  agency_id: string
  agencies: AgencySettings | AgencySettings[] | null
}

type ItemRow = NonNullable<Parameters<typeof resolveProjectBehavior>[1]['items']>[number]

type DraftRow = {
  id: string
  behavior_category: string | null
  created_at: string
  status: string
  blocking_step_label: string | null
  prompt_version: string | null
}

function settingsFor(project: ProjectRow): AgencySettings | null {
  const rel = project.agencies
  if (!rel) return null
  return Array.isArray(rel) ? rel[0] ?? null : rel
}

const stats = () => ({
  candidates: 0,
  due: 0,
  aiSent: 0,
  classicSent: 0,
  classicFallbacks: 0,
  generated: 0,
  notDue: 0,
  skipped: 0,
  capReached: 0,
  failed: 0,
  uncertain: 0,
  timedOut: 0,
  deferred: 0,
  pregenDeferred: 0,
})

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

    const startMs = Date.now()
    const elapsed = () => Date.now() - startMs
    const s = stats()

    const { data: projects, error } = await supabase
      .from('projects')
      .select(
        'id, created_at, status, last_portal_visit_at, agency_id, agencies(ai_reminders_enabled, auto_reminders_enabled, ai_reminder_auto_send, ai_reminder_max_per_project)',
      )
      .neq('status', 'completed')
    if (error) throw new Error(error.message)

    const allProjects = (projects ?? []) as ProjectRow[]
    const agencyIds = [...new Set(allProjects.map((p) => p.agency_id).filter(Boolean))]
    const { data: billingRows } = await supabase
      .from('billing_accounts')
      .select('agency_id, ai_addon_active')
      .in('agency_id', agencyIds.length > 0 ? agencyIds : ['00000000-0000-0000-0000-000000000000'])
    const addonByAgency = new Map(
      (billingRows ?? []).map((row) => [row.agency_id as string, row.ai_addon_active === true]),
    )

    // Les agences sans IA (ou add-on inactif) sont gérées par send-reminders-batch.
    const candidates = allProjects
      .filter((project) => {
        const settings = settingsFor(project)
        if (settings?.auto_reminders_enabled === false) return false
        return usesAiReminders(settings, addonByAgency.get(project.agency_id) === true)
      })
      .map((project) => ({ project, key: Math.random() }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.project)
    s.candidates = candidates.length

    async function loadDraft(projectId: string): Promise<DraftRow | null> {
      const { data } = await supabase
        .from('smart_reminders')
        .select('id, behavior_category, created_at, status, blocking_step_label, prompt_version')
        .eq('project_id', projectId)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)
      return (data?.[0] as DraftRow | undefined) ?? null
    }

    /** Brouillon encore valable pour ce comportement, sinon null (et nettoyé). */
    async function usableDraft(
      projectId: string,
      behavior: { behaviorCategory: string; clientActionLabels: string[] },
    ): Promise<DraftRow | null> {
      const draft = await loadDraft(projectId)
      if (!draft) return null
      if (draftStaleReason(draft, behavior.clientActionLabels)) {
        await supabase.from('smart_reminders').update({ status: 'stale' }).eq('id', draft.id)
        return null
      }
      const tooOld = Date.now() - new Date(draft.created_at).getTime() > DRAFT_STALE_HOURS * 3_600_000
      if (draft.behavior_category !== behavior.behaviorCategory || tooOld) {
        await supabase.from('smart_reminders').update({ status: 'dismissed' }).eq('id', draft.id)
        return null
      }
      return draft
    }

    async function generateDraft(
      projectId: string,
      behavior: Awaited<ReturnType<typeof resolveProjectBehavior>>,
    ): Promise<{ ok: boolean; timedOut: boolean; reminderId: string | null }> {
      const result = await invokeWithTimeout(
        'generate-smart-reminder',
        {
          projectId,
          behaviorCategory: behavior.behaviorCategory,
          blockingStepLabel: behavior.blockingStepLabel,
          clientActionLabels: behavior.clientActionLabels,
          progress: behavior.progress,
          // Jamais d'envoi depuis la génération : l'envoi est piloté ici.
          attemptClaim: false,
        },
        GEN_TIMEOUT_MS,
      )
      if (result.timedOut) s.timedOut += 1
      const payload = result.data as { error?: string; skipped?: boolean; reminderId?: string } | null
      if (result.error || payload?.error) {
        console.error('Smart reminder generation failed for', projectId, result.error?.message ?? payload?.error)
        return { ok: false, timedOut: result.timedOut, reminderId: null }
      }
      if (payload?.skipped || !payload?.reminderId) {
        return { ok: true, timedOut: false, reminderId: null }
      }
      s.generated += 1
      return { ok: true, timedOut: false, reminderId: payload.reminderId }
    }

    async function sendClassic(projectId: string, claimLogId: string): Promise<void> {
      const result = await invokeWithTimeout(
        'send-project-invite',
        { projectId, reminder: true, source: 'auto', claimLogId },
        SEND_TIMEOUT_MS,
      )
      const payload = result.data as { error?: string; success?: boolean } | null
      if (!result.error && payload?.success) {
        s.classicSent += 1
        return
      }
      if (result.timedOut) {
        // Peut-être envoyé : send-project-invite finalise lui-même la réservation.
        s.uncertain += 1
        console.error('Classic reminder timed out for', projectId)
        return
      }
      console.error('Classic reminder failed for', projectId, result.error?.message ?? payload?.error)
      await finalizeAutoReminder(supabase, claimLogId, 'failed')
      s.failed += 1
    }

    async function fallbackToClassic(projectId: string, claimLogId: string, reason: string) {
      console.log('Repli relance classique pour', projectId, '—', reason)
      s.classicFallbacks += 1
      await sendClassic(projectId, claimLogId)
    }

    async function processDue(project: ProjectRow, items: ItemRow[], claimLogId: string) {
      s.due += 1
      const settings = settingsFor(project)
      const behavior = await resolveProjectBehavior(supabase, {
        id: project.id,
        last_portal_visit_at: project.last_portal_visit_at,
        created_at: project.created_at,
        items,
      })
      const { count: priorSent } = await supabase
        .from('smart_reminders')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('status', 'sent')
      const draft = await usableDraft(project.id, behavior)

      const plan = planDueReminder({
        autoSend: settings?.ai_reminder_auto_send === true,
        hasPriorAiSent: (priorSent ?? 0) >= 1,
        hasSendableDraft: Boolean(draft),
      })

      if (plan === 'classic') {
        const reason =
          settings?.ai_reminder_auto_send === true
            ? '1ère relance IA en attente de validation'
            : 'envoi auto IA désactivé'
        await fallbackToClassic(project.id, claimLogId, reason)
        return
      }

      let reminderId = draft?.id ?? null
      if (plan === 'ai_generate_then_send') {
        if (elapsed() > AI_START_BUDGET_MS) {
          await fallbackToClassic(project.id, claimLogId, 'plus assez de temps pour générer')
          return
        }
        const gen = await generateDraft(project.id, behavior)
        const step = afterAiGeneration(gen)
        if (step !== 'send_draft') {
          await fallbackToClassic(
            project.id,
            claimLogId,
            gen.timedOut ? 'génération IA en timeout' : 'génération IA impossible',
          )
          return
        }
        reminderId = gen.reminderId
      }

      const sendResult = await invokeWithTimeout(
        'send-smart-reminder',
        { reminderId, claimLogId },
        SEND_TIMEOUT_MS,
      )
      const sendPayload = sendResult.data as { error?: string; success?: boolean } | null
      const step = afterAiSend({
        ok: !sendResult.error && sendPayload?.success === true,
        timedOut: sendResult.timedOut,
      })
      if (step === 'done') {
        s.aiSent += 1
        return
      }
      if (step === 'stop_uncertain') {
        s.uncertain += 1
        console.error('Smart reminder send timed out for', project.id)
        return
      }
      console.error('Smart reminder send failed for', project.id, sendResult.error?.message ?? sendPayload?.error)
      await finalizeAutoReminder(supabase, claimLogId, 'failed')
      const reclaim = await claimAutoReminder(supabase, project.id)
      if (!reclaim.ok) {
        s.skipped += 1
        return
      }
      await fallbackToClassic(project.id, reclaim.logId, 'envoi IA en échec')
    }

    // --- Passe 1 : projets dus (réservation + envoi IA ou classique) ---
    const notDue: { project: ProjectRow; items: ItemRow[] }[] = []
    s.deferred = await runWithConcurrency(
      candidates,
      CONCURRENCY,
      () => elapsed() < DUE_START_BUDGET_MS,
      async (project) => {
        try {
          const { data: itemRows } = await supabase
            .from('checklist_items')
            .select(
              'label, type, completed, value, order_index, review_status, review_note, config, submitted_at, reviewed_at',
            )
            .eq('project_id', project.id)
            .order('order_index', { ascending: true })
          const items = (itemRows ?? []) as ItemRow[]
          if (!hasClientPendingActions(itemRows ?? [])) {
            s.skipped += 1
            return
          }
          const claim = await claimAutoReminder(supabase, project.id)
          if (!claim.ok) {
            if (claim.errorCode === 'cap_reached') {
              s.capReached += 1
            } else if (
              claim.errorCode === 'delay_not_elapsed' ||
              claim.errorCode === 'outside_send_window'
            ) {
              s.notDue += 1
              notDue.push({ project, items })
            } else {
              s.skipped += 1
            }
            return
          }
          try {
            await processDue(project, items, claim.logId)
          } catch (dueError) {
            // Erreur inattendue avant tout envoi : on tente quand même le classique.
            console.error('Due processing error for', project.id, (dueError as Error).message)
            await fallbackToClassic(project.id, claim.logId, 'erreur inattendue')
          }
        } catch (projectError) {
          console.error('Smart batch project error', project.id, (projectError as Error).message)
          s.failed += 1
        }
      },
    )

    // --- Passe 2 : brouillons IA d'avance pour les projets pas encore dus ---
    s.pregenDeferred = await runWithConcurrency(
      notDue,
      CONCURRENCY,
      () => elapsed() < PREGEN_START_BUDGET_MS,
      async ({ project, items }) => {
        try {
          const behavior = await resolveProjectBehavior(supabase, {
            id: project.id,
            last_portal_visit_at: project.last_portal_visit_at,
            created_at: project.created_at,
            items,
          })
          if (await usableDraft(project.id, behavior)) return
          await generateDraft(project.id, behavior)
        } catch (pregenError) {
          console.error('Pregen error for', project.id, (pregenError as Error).message)
        }
      },
    )

    const summary = { success: true, durationMs: elapsed(), ...s }
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
