/**
 * Plafond de relances auto consécutives sans réponse client.
 * Ancre = max(submitted_at, last_portal_visit_at, reminder_cap_reset_at).
 */

export type ReminderLogForCap = {
  source: 'auto' | 'manual' | string
  status?: 'sending' | 'sent' | 'failed' | string | null
  sent_at: string
}

export function lastClientActivityAnchor(input: {
  maxSubmittedAt: string | null
  lastPortalVisitAt: string | null
  reminderCapResetAt: string | null
}): string | null {
  const candidates = [
    input.maxSubmittedAt,
    input.lastPortalVisitAt,
    input.reminderCapResetAt,
  ].filter((value): value is string => Boolean(value))
  if (candidates.length === 0) return null
  return candidates.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest,
  )
}

export function countConsecutiveAutoReminders(
  logs: ReminderLogForCap[],
  anchorIso: string | null,
): number {
  return logs.filter((log) => {
    if (log.source !== 'auto') return false
    const status = log.status ?? 'sent'
    if (status !== 'sent' && status !== 'sending') return false
    if (!anchorIso) return true
    return new Date(log.sent_at).getTime() > new Date(anchorIso).getTime()
  }).length
}

export function isReminderCapReached(
  consecutiveCount: number,
  maxPerProject: number,
): boolean {
  const max = Number.isFinite(maxPerProject) && maxPerProject >= 1 ? maxPerProject : 3
  return consecutiveCount >= max
}
