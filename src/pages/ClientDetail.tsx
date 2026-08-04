import { useCallback, useEffect, useState, startTransition } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { ClientActivityTimeline } from '../components/client/ClientActivityTimeline'
import { ClientDocumentsPanel } from '../components/client/ClientDocumentsPanel'
import { ClientPropertyPanel } from '../components/client/ClientPropertyPanel'
import { ClientProjectRow, type ClientProjectListItem } from '../components/client/ClientProjectRow'
import { ClientRecordHeader } from '../components/client/ClientRecordHeader'
import { Button, Card } from '../components/ui'
import { useClientFieldSave } from '../hooks/useClientFieldSave'
import {
  mergeClientActivityEvents,
  type ClientActivityEvent,
} from '../lib/clientActivity'
import { mapClientDocuments, type ClientDocumentItem } from '../lib/clientDocuments'
import type { ClientRecord } from '../lib/clientRecord'
import type { CompanyLookupResult } from '../lib/companyLookup'
import { findProjectBottleneck, type BottleneckItem } from '../lib/projectBottleneck'
import type { ReviewStatus } from '../lib/checklistReview'
import { supabase } from '../lib/supabase'

const EMPTY_CLIENT: ClientRecord = {
  id: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: null,
  company_name: null,
  company_type: null,
  siret: null,
  siren: null,
  code_naf: null,
  vat_number: null,
  address_street: null,
  address_city: null,
  address_postal_code: null,
  address_country: null,
  website: null,
  industry: null,
  company_size: null,
  notes: null,
  iban: null,
  bic: null,
  source_donnees_legales: null,
  created_at: '',
}

type ChecklistLoadRow = {
  id: string
  project_id: string
  label: string
  type: string
  completed: boolean
  value: string | null
  order_index: number
  review_status: ReviewStatus | null
  submitted_at: string | null
  reviewed_at: string | null
  config: BottleneckItem['config']
}

export function ClientDetail() {
  const { id } = useParams()
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [projects, setProjects] = useState<ClientProjectListItem[]>([])
  const [activityAll, setActivityAll] = useState<ClientActivityEvent[]>([])
  const [documents, setDocuments] = useState<ClientDocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [docsLoading, setDocsLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2000)
  }, [])

  const loadCore = useCallback(async (clientId: string, signal?: { cancelled: boolean }) => {
    const alive = () => !signal?.cancelled

    setLoading(true)
    const { data: c } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle()
    if (!alive()) return
    if (!c) {
      setClient(null)
      setProjects([])
      setLoading(false)
      setDocuments([])
      setActivityAll([])
      setDocsLoading(false)
      setActivityLoading(false)
      return
    }
    setClient(c as ClientRecord)

    const { data: projectRows } = await supabase
      .from('projects')
      .select('id, client_name, status, created_at, token')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (!alive()) return

    const rawProjects = (projectRows ?? []) as Array<{
      id: string
      client_name: string
      status: 'pending' | 'in_progress' | 'completed'
      created_at: string
      token: string
    }>

    if (rawProjects.length === 0) {
      setProjects([])
      setLoading(false)
      setDocuments([])
      setActivityAll([])
      setDocsLoading(false)
      setActivityLoading(false)
      return
    }

    const projectIds = rawProjects.map((p) => p.id)
    const { data: checklistRows } = await supabase
      .from('checklist_items')
      .select(
        'id, project_id, label, type, completed, value, order_index, review_status, submitted_at, reviewed_at, config',
      )
      .in('project_id', projectIds)
      .order('order_index', { ascending: true })

    if (!alive()) return

    const itemsByProject = new Map<string, BottleneckItem[]>()
    const countsByProject = new Map<string, { total: number; completed: number }>()
    for (const row of (checklistRows ?? []) as ChecklistLoadRow[]) {
      const current = countsByProject.get(row.project_id) ?? { total: 0, completed: 0 }
      current.total += 1
      if (row.completed) current.completed += 1
      countsByProject.set(row.project_id, current)

      const list = itemsByProject.get(row.project_id) ?? []
      list.push({
        label: row.label,
        type: row.type,
        completed: row.completed,
        value: row.value,
        order_index: row.order_index,
        review_status: row.review_status,
        submitted_at: row.submitted_at,
        reviewed_at: row.reviewed_at,
        config: row.config,
      })
      itemsByProject.set(row.project_id, list)
    }

    setProjects(
      rawProjects.map((project) => {
        const counts = countsByProject.get(project.id) ?? { total: 0, completed: 0 }
        const bottleneck =
          project.status === 'completed'
            ? null
            : findProjectBottleneck(itemsByProject.get(project.id) ?? [], project.created_at)
        return {
          id: project.id,
          clientName: project.client_name,
          status: project.status,
          createdAt: project.created_at,
          token: project.token,
          completedCount: counts.completed,
          totalCount: counts.total,
          progress: counts.total ? Math.round((counts.completed / counts.total) * 100) : 0,
          blockingStepLabel: bottleneck?.label ?? null,
          blockingOwner: bottleneck?.owner ?? null,
          blockingSince: bottleneck?.since ?? null,
        }
      }),
    )
    setLoading(false)

    setDocsLoading(true)
    setActivityLoading(true)

    const [{ data: reminderRows }, { data: extractionRows }, { data: generatedRows }] =
      await Promise.all([
        supabase
          .from('project_reminder_logs')
          .select('id, project_id, source, sent_at')
          .in('project_id', projectIds)
          .order('sent_at', { ascending: false }),
        supabase
          .from('extracted_document_data')
          .select('id, project_id, document_type, status, created_at, reviewed_at')
          .in('project_id', projectIds),
        supabase
          .from('generated_documents')
          .select('id, project_id, status, created_at, finalized_at, brief')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false }),
      ])

    if (!alive()) return

    const projectMeta = rawProjects.map((p) => ({
      id: p.id,
      client_name: p.client_name,
      created_at: p.created_at,
    }))

    setDocuments(
      mapClientDocuments({
        projects: projectMeta,
        checklist: (checklistRows ?? []) as ChecklistLoadRow[],
        generated: (generatedRows ?? []) as Array<{
          id: string
          project_id: string
          status: 'draft' | 'finalized'
          created_at: string
          finalized_at: string | null
          brief: string
        }>,
      }),
    )
    setDocsLoading(false)

    setActivityAll(
      mergeClientActivityEvents({
        projects: projectMeta,
        reminders: (reminderRows ?? []) as Array<{
          id: string
          project_id: string
          source: 'auto' | 'manual'
          sent_at: string
        }>,
        checklist: (checklistRows ?? []) as ChecklistLoadRow[],
        extractions: (extractionRows ?? []) as Array<{
          id: string
          project_id: string
          document_type: string
          status: string
          created_at: string
          reviewed_at: string | null
        }>,
      }),
    )
    setActivityLoading(false)
  }, [])

  useEffect(() => {
    if (!id) return
    const signal = { cancelled: false }
    startTransition(() => {
      void loadCore(id, signal)
    })
    return () => {
      signal.cancelled = true
    }
  }, [id, loadCore])

  const fieldSave = useClientFieldSave({
    clientId: id ?? '',
    client: client ?? EMPTY_CLIENT,
    onClientChange: (next) => setClient(next),
  })

  const activeProjectCount = projects.filter((p) => p.status !== 'completed').length
  const portalToken = projects.find((p) => p.status !== 'completed')?.token ?? projects[0]?.token

  const applyCompany = async (company: CompanyLookupResult) => {
    if (!client) return false
    const streetParts = company.adresse?.split(',') ?? []
    return fieldSave.savePatch('company_lookup', {
      company_name: company.raison_sociale,
      company_type: company.forme_juridique || null,
      siret: company.siret,
      siren: company.siren,
      code_naf: company.code_naf || null,
      vat_number: company.vat_number,
      address_street: streetParts[0]?.trim() || company.adresse || null,
      address_postal_code: company.code_postal || null,
      address_city: company.ville || null,
      address_country: 'France',
      source_donnees_legales: 'api_gouv',
    })
  }

  const handleDelete = async () => {
    if (!client || !id) return
    if (projects.length > 0) {
      showToast('Supprimez d’abord les projets liés')
      return
    }
    if (
      !window.confirm(
        `Supprimer le client ${client.first_name} ${client.last_name} ? Cette action est définitive.`,
      )
    ) {
      return
    }
    setDeleting(true)
    const { error } = await supabase.from('clients').delete().eq('id', id)
    setDeleting(false)
    if (error) {
      showToast('Suppression impossible')
      return
    }
    window.location.href = '/dashboard/clients'
  }

  if (loading) {
    return (
      <DashboardLayout title="Client" subtitle="Chargement…" maxWidth="5xl">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
      </DashboardLayout>
    )
  }

  if (!client || !id) {
    return (
      <DashboardLayout title="Client" maxWidth="5xl">
        <p className="text-sm font-body text-[var(--amber)]">Client introuvable.</p>
        <Link
          to="/dashboard/clients"
          className="mt-4 inline-block text-sm font-body text-[var(--accent)] hover:underline"
        >
          Retour aux clients
        </Link>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout maxWidth="5xl">
      <ClientRecordHeader
        client={client}
        activeProjectCount={activeProjectCount}
        portalToken={portalToken}
        onCopyPortalLink={() => {
          if (!portalToken) return
          void navigator.clipboard.writeText(`${window.location.origin}/p/${portalToken}`)
          showToast('Lien portail copié')
        }}
        onDelete={() => {
          void handleDelete()
        }}
      />

      <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="order-3 space-y-4 lg:order-1 lg:row-span-3">
          <ClientPropertyPanel
            client={client}
            statuses={fieldSave.statuses}
            errors={fieldSave.errors}
            onSaveField={(field, raw) =>
              fieldSave.saveField(field as Parameters<typeof fieldSave.saveField>[0], raw)
            }
            onScheduleSaveField={(field, raw) =>
              fieldSave.scheduleSaveField(
                field as Parameters<typeof fieldSave.scheduleSaveField>[0],
                raw,
              )
            }
            onSaveAddress={fieldSave.saveAddressPatch}
            onApplyCompany={applyCompany}
            onCancelField={fieldSave.cancelPending}
          />
        </div>

        <section className="order-1 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-[var(--ink)]">
              Projets ({projects.length})
            </h2>
            <Link to={`/dashboard/new?clientId=${client.id}`}>
              <Button variant="secondary">Nouveau projet</Button>
            </Link>
          </div>
          {projects.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-sm)] bg-[var(--surface)] px-4 py-8 text-center">
              <p className="text-sm font-body font-medium text-[var(--ink)]">
                Aucun projet pour ce client
              </p>
              <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                Créez un onboarding pour démarrer la relation.
              </p>
              <Link to={`/dashboard/new?clientId=${client.id}`} className="mt-4 inline-block">
                <Button>+ Créer un projet</Button>
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {projects.map((project) => (
                <ClientProjectRow key={project.id} project={project} />
              ))}
            </ul>
          )}
        </section>

        <div className="order-2 lg:order-2">
          <ClientDocumentsPanel items={documents} loading={docsLoading} />
        </div>

        <div className="order-4 lg:order-2">
          <ClientActivityTimeline
            key={id}
            events={activityAll}
            loading={activityLoading}
          />
        </div>
      </div>
      {deleting ? (
        <Card className="fixed inset-x-4 bottom-24 z-40 p-4 shadow-lg md:bottom-8 md:left-1/2 md:right-auto md:w-full md:max-w-md md:-translate-x-1/2">
          <p className="text-sm font-body text-[var(--ink)]">Suppression…</p>
        </Card>
      ) : null}

      {toast ? (
        <div className="fixed bottom-[calc(5.25rem+var(--safe-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm font-body text-[var(--white)] shadow-lg md:bottom-8">
          {toast}
        </div>
      ) : null}
    </DashboardLayout>
  )
}
