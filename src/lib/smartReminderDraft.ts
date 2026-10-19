/**
 * Miroir de supabase/functions/_shared/smartReminderDraft.ts
 * — validité d'un brouillon côté UI (filtre / marquage stale).
 */
export const CURRENT_REMINDER_PROMPT_VERSION = 'reminder_v3_2026_10'

export type DraftLike = {
  id: string
  status: string
  blocking_step_label?: string | null
  prompt_version?: string | null
  behavior_category?: string | null
}

export function isDraftSendable(
  draft: DraftLike,
  clientActionLabels: string[],
  currentVersion: string = CURRENT_REMINDER_PROMPT_VERSION,
): boolean {
  if (draft.status !== 'draft') return false
  if (draft.prompt_version !== currentVersion) return false
  if (!draft.blocking_step_label) return clientActionLabels.length > 0
  return clientActionLabels.includes(draft.blocking_step_label)
}
