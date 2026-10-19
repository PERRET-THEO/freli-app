import { formatEuro } from './formatEuro'

export type ClientActivityEvent = {
  id: string
  eventType:
    | 'reminder_sent'
    | 'reminder_cap_reset'
    | 'step_completed'
    | 'document_received'
    | 'contract_signed'
    | 'extraction_ready'
    | 'project_created'
    | 'secret.reveal'
    | 'secret.copy'
    | 'secret.cleared'
    | 'payment.amount_changed'
    | 'invite.resent'
  title: string
  occurredAt: string
  projectId: string | null
  projectName: string | null
  /** Optional actor label (e.g. agency name) shown next to the date */
  actorLabel?: string | null
}

/** Événements stockés affichés dans les timelines (agence ou client). */
const STORED_ACTIVITY_TYPES = new Set([
  'secret.reveal',
  'secret.copy',
  'secret.cleared',
  'payment.amount_changed',
  'reminder_cap_reset',
  'invite.resent',
])

/**
 * Types d'activité agence — exclus du calcul « dernière activité client »
 * (plafond relances, stalled, tris clients).
 */
export const AGENCY_ONLY_ACTIVITY_TYPES = new Set(['invite.resent', 'reminder_cap_reset'])

export function isClientFacingActivityType(eventType: string): boolean {
  return !AGENCY_ONLY_ACTIVITY_TYPES.has(eventType)
}

export type StoredActivityRow = {
  id: string
  event_type: string
  title: string
  occurred_at: string
  project_id: string | null
  metadata?: Record<string, unknown> | null
}

export function formatAmountChangedTitle(
  oldPrice: number | null | undefined,
  newPrice: number | null | undefined,
): string {
  return `Montant modifié : ${formatEuro(oldPrice)} → ${formatEuro(newPrice)}`
}

function titleForStoredEvent(row: StoredActivityRow): string {
  if (row.event_type === 'payment.amount_changed') {
    const meta = row.metadata ?? {}
    const oldRaw = meta.old_price
    const newRaw = meta.new_price
    const oldPrice =
      oldRaw == null || oldRaw === '' ? null : Number(oldRaw)
    const newPrice =
      newRaw == null || newRaw === '' ? null : Number(newRaw)
    if (
      (oldPrice == null || Number.isFinite(oldPrice)) &&
      newPrice != null &&
      Number.isFinite(newPrice)
    ) {
      return formatAmountChangedTitle(oldPrice, newPrice)
    }
  }
  return row.title
}

type ReminderRow = {
  id: string
  project_id: string
  source: 'auto' | 'manual'
  sent_at: string
}

type ChecklistRow = {
  id: string
  project_id: string
  label: string
  type: string
  completed: boolean
  submitted_at: string | null
  reviewed_at: string | null
  value: string | null
}

type ExtractionRow = {
  id: string
  project_id: string
  document_type: string
  status: string
  created_at: string
  reviewed_at: string | null
}

type ProjectMeta = {
  id: string
  client_name: string
  created_at: string
}

export function mergeClientActivityEvents(input: {
  projects: ProjectMeta[]
  reminders: ReminderRow[]
  checklist: ChecklistRow[]
  extractions: ExtractionRow[]
  storedEvents?: StoredActivityRow[]
  /** Shown on stored events when no per-event actor is available */
  defaultActorLabel?: string | null
}): ClientActivityEvent[] {
  const projectName = new Map(input.projects.map((p) => [p.id, p.client_name]))
  const events: ClientActivityEvent[] = []

  for (const row of input.storedEvents ?? []) {
    if (!STORED_ACTIVITY_TYPES.has(row.event_type)) {
      continue
    }
    events.push({
      id: `stored-${row.id}`,
      eventType: row.event_type as ClientActivityEvent['eventType'],
      title: titleForStoredEvent(row),
      occurredAt: row.occurred_at,
      projectId: row.project_id,
      projectName: row.project_id ? projectName.get(row.project_id) ?? null : null,
      actorLabel: input.defaultActorLabel ?? null,
    })
  }

  for (const project of input.projects) {
    events.push({
      id: `project-created-${project.id}`,
      eventType: 'project_created',
      title: 'Projet créé',
      occurredAt: project.created_at,
      projectId: project.id,
      projectName: project.client_name,
    })
  }

  for (const row of input.reminders) {
    events.push({
      id: `reminder-${row.id}`,
      eventType: 'reminder_sent',
      title: row.source === 'auto' ? 'Relance automatique envoyée' : 'Relance manuelle envoyée',
      occurredAt: row.sent_at,
      projectId: row.project_id,
      projectName: projectName.get(row.project_id) ?? null,
    })
  }

  for (const row of input.checklist) {
    if (row.type === 'signature' && row.completed) {
      events.push({
        id: `signed-${row.id}`,
        eventType: 'contract_signed',
        title: `Contrat signé — ${row.label}`,
        occurredAt: row.reviewed_at ?? row.submitted_at ?? new Date(0).toISOString(),
        projectId: row.project_id,
        projectName: projectName.get(row.project_id) ?? null,
      })
      continue
    }
    if (row.type === 'file' && row.completed && row.value) {
      events.push({
        id: `file-${row.id}`,
        eventType: 'document_received',
        title: `Document reçu — ${row.label}`,
        occurredAt: row.submitted_at ?? row.reviewed_at ?? new Date(0).toISOString(),
        projectId: row.project_id,
        projectName: projectName.get(row.project_id) ?? null,
      })
      continue
    }
    if (row.completed && row.type !== 'file' && row.type !== 'signature') {
      events.push({
        id: `step-${row.id}`,
        eventType: 'step_completed',
        title: `Étape terminée — ${row.label}`,
        occurredAt: row.submitted_at ?? row.reviewed_at ?? new Date(0).toISOString(),
        projectId: row.project_id,
        projectName: projectName.get(row.project_id) ?? null,
      })
    }
  }

  for (const row of input.extractions) {
    if (row.status === 'pending_review' || row.status === 'validated') {
      events.push({
        id: `extraction-${row.id}`,
        eventType: 'extraction_ready',
        title:
          row.status === 'validated'
            ? `Extraction validée (${row.document_type})`
            : `Données à valider (${row.document_type})`,
        occurredAt: row.reviewed_at ?? row.created_at,
        projectId: row.project_id,
        projectName: projectName.get(row.project_id) ?? null,
      })
    }
  }

  return events
    .filter((event) => event.occurredAt && !Number.isNaN(Date.parse(event.occurredAt)))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

export function paginateActivityEvents(
  events: ClientActivityEvent[],
  page: number,
  pageSize = 20,
): { items: ClientActivityEvent[]; hasMore: boolean } {
  const start = page * pageSize
  const items = events.slice(start, start + pageSize)
  return { items, hasMore: start + pageSize < events.length }
}
