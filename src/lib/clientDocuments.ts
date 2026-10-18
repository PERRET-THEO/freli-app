export type ClientDocumentKind = 'signed_contract' | 'ai_document' | 'uploaded_file'

export type ClientDocumentItem = {
  id: string
  kind: ClientDocumentKind
  title: string
  statusLabel: string
  occurredAt: string
  projectId: string
  projectName: string
  /** Path storage ou URL ; le panneau résout une signed URL à l’ouverture. */
  href: string | null
  storagePath?: string | null
}

type ChecklistDocRow = {
  id: string
  project_id: string
  label: string
  type: string
  completed: boolean
  value: string | null
  submitted_at: string | null
  reviewed_at: string | null
}

type GeneratedDocRow = {
  id: string
  project_id: string
  status: 'draft' | 'finalized'
  created_at: string
  finalized_at: string | null
  brief: string
  current_version?: { title?: string } | null
}

export function mapClientDocuments(input: {
  projects: Array<{ id: string; client_name: string }>
  checklist: ChecklistDocRow[]
  generated: GeneratedDocRow[]
}): ClientDocumentItem[] {
  const projectName = new Map(input.projects.map((p) => [p.id, p.client_name]))
  const items: ClientDocumentItem[] = []

  for (const row of input.checklist) {
    if (row.type === 'signature' && row.completed) {
      items.push({
        id: `signed-${row.id}`,
        kind: 'signed_contract',
        title: row.label,
        statusLabel: 'Signé',
        occurredAt: row.reviewed_at ?? row.submitted_at ?? new Date(0).toISOString(),
        projectId: row.project_id,
        projectName: projectName.get(row.project_id) ?? 'Projet',
        href: row.value?.startsWith('http') ? row.value : null,
        storagePath: row.value && !row.value.startsWith('http') ? row.value : null,
      })
    }
    if (row.type === 'file' && row.value) {
      items.push({
        id: `file-${row.id}`,
        kind: 'uploaded_file',
        title: row.label,
        statusLabel: row.completed ? 'Reçu' : 'En cours',
        occurredAt: row.submitted_at ?? row.reviewed_at ?? new Date(0).toISOString(),
        projectId: row.project_id,
        projectName: projectName.get(row.project_id) ?? 'Projet',
        href: row.value.startsWith('http') ? row.value : null,
        storagePath: row.value.startsWith('http') ? null : row.value,
      })
    }
  }

  for (const row of input.generated) {
    const briefPreview = row.brief.trim().slice(0, 48)
    const titleFromVersion =
      row.current_version?.title?.trim() ||
      (briefPreview ? `Proposition IA — ${briefPreview}` : 'Proposition / contrat IA')
    items.push({
      id: `ai-${row.id}`,
      kind: 'ai_document',
      title: titleFromVersion,
      statusLabel: row.status === 'finalized' ? 'Finalisé (projet)' : 'Brouillon',
      occurredAt: row.finalized_at ?? row.created_at,
      projectId: row.project_id,
      projectName: projectName.get(row.project_id) ?? 'Projet',
      href: `/dashboard/project/${row.project_id}`,
    })
  }

  return items
    .filter((item) => item.occurredAt && !Number.isNaN(Date.parse(item.occurredAt)))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

export function groupClientDocuments(items: ClientDocumentItem[]) {
  return {
    signed: items.filter((item) => item.kind === 'signed_contract'),
    ai: items.filter((item) => item.kind === 'ai_document'),
    files: items.filter((item) => item.kind === 'uploaded_file'),
  }
}
