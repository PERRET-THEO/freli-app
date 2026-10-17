import { supabase } from './supabase'

export type SmartReminderBehavior = 'not_opened' | 'opened_not_clicked' | 'stuck_on_step'
export type SmartReminderStatus = 'draft' | 'sent' | 'dismissed'
export type SmartReminderTone = 'professional' | 'warm' | 'direct'

export type SmartReminderRecord = {
  id: string
  project_id: string
  behavior_category: SmartReminderBehavior
  blocking_step_label: string | null
  subject: string
  body: string
  tone: string
  status: SmartReminderStatus
  sent_at: string | null
  created_at: string
}

export const BEHAVIOR_LABELS: Record<SmartReminderBehavior, string> = {
  not_opened: 'Email non ouvert',
  opened_not_clicked: 'Ouvert ou cliqué, parcours non terminé',
  stuck_on_step: 'Bloqué sur une étape',
}

export const TONE_OPTIONS: Array<{ value: SmartReminderTone; label: string }> = [
  { value: 'professional', label: 'Professionnel' },
  { value: 'warm', label: 'Chaleureux' },
  { value: 'direct', label: 'Direct' },
]

export const SMART_REMINDER_MAX_OPTIONS = [1, 2, 3, 5] as const

export function normalizeSmartReminderTone(raw: string | null | undefined): SmartReminderTone {
  if (raw === 'warm' || raw === 'direct') return raw
  return 'professional'
}

export function normalizeSmartReminderMax(raw: number | null | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 && raw <= 10) {
    return Math.round(raw)
  }
  return 3
}

export async function fetchProjectSmartReminders(
  projectId: string,
): Promise<SmartReminderRecord[]> {
  const { data, error } = await supabase
    .from('smart_reminders')
    .select(
      'id, project_id, behavior_category, blocking_step_label, subject, body, tone, status, sent_at, created_at',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as SmartReminderRecord[]
}

const AI_RATE_LIMIT_MESSAGE =
  'Limite de requêtes IA atteinte. Réessayez dans quelques minutes.'

/** Filet UI : humanise les erreurs rate-limit provider (Gemini / legacy). */
function humanizeInvokeError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('429') ||
    lower.includes('rate_limit') ||
    lower.includes('rate limit exceeded') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota')
  ) {
    return AI_RATE_LIMIT_MESSAGE
  }
  return message
}

/** Extrait le détail métier d'un FunctionsHttpError (body JSON dans error.context). */
async function invokeErrorMessage(
  error: { message?: string; context?: Response } | null,
  data: unknown,
): Promise<string> {
  let raw = ''

  if (data && typeof data === 'object') {
    const body = data as { error?: unknown; reason?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) {
      raw = body.error
    } else if (typeof body.reason === 'string' && body.reason.trim()) {
      raw = body.reason
    }
  }
  const context = error?.context
  if (!raw && context && typeof context.json === 'function') {
    try {
      const parsed = (await context.clone().json()) as { error?: unknown; reason?: unknown }
      if (typeof parsed?.error === 'string' && parsed.error.trim()) {
        raw = parsed.error
      } else if (typeof parsed?.reason === 'string' && parsed.reason.trim()) {
        raw = parsed.reason
      }
    } catch {
      // ignore parse errors
    }
  }
  if (!raw) {
    raw = error?.message?.trim() || 'Erreur Edge Function'
  }
  return humanizeInvokeError(raw)
}

/** Envoi d'un brouillon (éventuellement édité) via l'Edge Function dédiée. */
export async function sendSmartReminder(
  reminderId: string,
  subject: string,
  body: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-smart-reminder', {
    body: { reminderId, subject, body },
  })
  if (error) throw new Error(await invokeErrorMessage(error, data))
  if (data?.error) throw new Error(String(data.error))
}

export async function dismissSmartReminder(reminderId: string): Promise<void> {
  const { error } = await supabase
    .from('smart_reminders')
    .update({ status: 'dismissed' })
    .eq('id', reminderId)
  if (error) throw new Error(error.message)
}

export type RequestSmartReminderResult = {
  reminderId?: string
  status: 'draft' | 'sent'
  existing?: boolean
  previewRequired?: boolean
  behaviorCategory?: SmartReminderBehavior
  message?: string
}

/** Génère (ou récupère) une relance IA pour un projet — bouton Relancer / CTA panel. */
export async function requestSmartReminder(
  projectId: string,
  options?: { forceRefresh?: boolean },
): Promise<RequestSmartReminderResult> {
  const { data, error } = await supabase.functions.invoke('request-smart-reminder', {
    body: { projectId, forceRefresh: options?.forceRefresh === true },
  })
  if (error) throw new Error(await invokeErrorMessage(error, data))
  if (data?.error) throw new Error(String(data.error))
  if (data?.skipped) {
    throw new Error(String(data.reason ?? 'Génération IA indisponible (add-on ou crédits).'))
  }
  return {
    reminderId: typeof data?.reminderId === 'string' ? data.reminderId : undefined,
    status: data?.status === 'sent' ? 'sent' : 'draft',
    existing: data?.existing === true,
    previewRequired: data?.previewRequired === true,
    behaviorCategory: data?.behaviorCategory as SmartReminderBehavior | undefined,
    message: typeof data?.message === 'string' ? data.message : undefined,
  }
}
