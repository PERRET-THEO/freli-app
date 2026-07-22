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
  opened_not_clicked: 'Ouvert sans visite du portail',
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

/** Envoi d'un brouillon (éventuellement édité) via l'Edge Function dédiée. */
export async function sendSmartReminder(
  reminderId: string,
  subject: string,
  body: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-smart-reminder', {
    body: { reminderId, subject, body },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
}

export async function dismissSmartReminder(reminderId: string): Promise<void> {
  const { error } = await supabase
    .from('smart_reminders')
    .update({ status: 'dismissed' })
    .eq('id', reminderId)
  if (error) throw new Error(error.message)
}
