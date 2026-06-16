export const DEFAULT_REMINDER_DELAY_HOURS = 48

export const REMINDER_DELAY_OPTIONS = [
  { label: '24 heures', value: 24 },
  { label: '48 heures (recommandé)', value: 48 },
  { label: '72 heures', value: 72 },
  { label: '5 jours', value: 120 },
  { label: '7 jours', value: 168 },
] as const

export type ReminderLogRow = {
  id: string
  project_id: string | null
  recipient_email: string | null
  sent_at: string
  source: 'auto' | 'manual'
  projects?: { client_name: string | null } | { client_name: string | null }[] | null
}

export function normalizeReminderDelayHours(raw: number | null | undefined): number {
  const value = raw ?? DEFAULT_REMINDER_DELAY_HOURS
  if (!Number.isFinite(value) || value < 12) return DEFAULT_REMINDER_DELAY_HOURS
  return Math.round(value)
}

export function reminderDelayLabel(hours: number): string {
  const match = REMINDER_DELAY_OPTIONS.find((o) => o.value === hours)
  if (match) return match.label
  if (hours % 24 === 0) return `${hours / 24} jours`
  return `${hours} heures`
}
