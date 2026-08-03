export type ClientActivityEvent = {
  id: string
  eventType:
    | 'reminder_sent'
    | 'step_completed'
    | 'document_received'
    | 'contract_signed'
    | 'extraction_ready'
    | 'project_created'
  title: string
  occurredAt: string
  projectId: string | null
  projectName: string | null
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
}): ClientActivityEvent[] {
  const projectName = new Map(input.projects.map((p) => [p.id, p.client_name]))
  const events: ClientActivityEvent[] = []

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
