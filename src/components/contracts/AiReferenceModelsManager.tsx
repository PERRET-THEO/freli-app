import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui'
import {
  deleteAgencyDocumentModel,
  fetchAgencyDocumentModels,
  uploadAgencyDocumentModel,
  MAX_REFERENCE_MODELS,
  type AgencyDocumentModel,
} from '../../lib/generatedDocuments'
import {
  TemplateEmptyState,
  TemplateIntroCard,
  TemplateItemCard,
  TemplatesGridSkeleton,
} from '../templates'

type AiReferenceModelsManagerProps = {
  agencyId: string | null
}

type StructureSummary = {
  document_kind?: string
  tone_description?: string
  sections?: Array<{ heading?: string }>
  recurring_clauses?: Array<{ title?: string }>
}

function SummaryPreview({ summary }: { summary: StructureSummary }) {
  const sections = (summary.sections ?? []).map((s) => s.heading).filter(Boolean)
  const clauses = (summary.recurring_clauses ?? []).map((c) => c.title).filter(Boolean)
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3 text-xs font-body text-[var(--ink-muted)]">
      {summary.tone_description ? (
        <p>
          <span className="font-medium text-[var(--ink-soft)]">Ton : </span>
          {summary.tone_description}
        </p>
      ) : null}
      {sections.length > 0 ? (
        <p className="mt-1.5">
          <span className="font-medium text-[var(--ink-soft)]">Structure : </span>
          {sections.join(' · ')}
        </p>
      ) : null}
      {clauses.length > 0 ? (
        <p className="mt-1.5">
          <span className="font-medium text-[var(--ink-soft)]">Clauses types : </span>
          {clauses.join(' · ')}
        </p>
      ) : null}
    </div>
  )
}

export function AiReferenceModelsManager({ agencyId }: AiReferenceModelsManagerProps) {
  const [models, setModels] = useState<AgencyDocumentModel[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!agencyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchAgencyDocumentModels(agencyId)
      .then(setModels)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agencyId])

  const handleUpload = async (file: File | null) => {
    if (!file || !agencyId) return
    if (file.type !== 'application/pdf') {
      setErrorMsg('Seuls les PDF sont acceptés.')
      return
    }
    if (models.length >= MAX_REFERENCE_MODELS) {
      setErrorMsg(`Maximum ${MAX_REFERENCE_MODELS} modèles de référence.`)
      return
    }
    setUploading(true)
    setErrorMsg(null)
    try {
      const model = await uploadAgencyDocumentModel(agencyId, file)
      setModels((cur) => [model, ...cur])
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Upload impossible.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (model: AgencyDocumentModel) => {
    if (!window.confirm(`Supprimer le modèle « ${model.name} » ?`)) return
    setDeletingId(model.id)
    setErrorMsg(null)
    try {
      await deleteAgencyDocumentModel(model)
      setModels((cur) => cur.filter((m) => m.id !== model.id))
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Suppression impossible.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <TemplateIntroCard
          title="Modèles de référence pour l'IA"
          description="Uploadez des contrats ou propositions existants pour que l'IA apprenne votre style et votre structure."
        />
        <TemplatesGridSkeleton count={2} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TemplateIntroCard
        title="Modèles de référence pour l'IA"
        description="Uploadez 1 à 3 contrats ou propositions que vous utilisez déjà : l'IA en apprend le style, la structure de clauses et le ton, puis s'en inspire pour chaque génération. Seul un résumé de structure est réutilisé — vos documents restent dans votre espace de stockage."
        countLabel={`${models.length}/${MAX_REFERENCE_MODELS} modèles`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !agencyId || models.length >= MAX_REFERENCE_MODELS}
        >
          {uploading ? "Analyse en cours… (jusqu'à 1 min)" : 'Ajouter un modèle PDF'}
        </Button>
      </TemplateIntroCard>

      {errorMsg ? <p className="text-sm font-body text-[var(--amber)]">{errorMsg}</p> : null}

      {models.length === 0 ? (
        <TemplateEmptyState
          icon="✨"
          title="Aucun modèle de référence"
          description="Ajoutez un PDF existant pour que l'IA s'inspire de votre ton et de votre structure de clauses."
          action={
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !agencyId}
            >
              Ajouter un modèle PDF
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {models.map((model) => (
            <TemplateItemCard
              key={model.id}
              icon={
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] font-display text-sm font-extrabold text-[var(--accent)]">
                  IA
                </div>
              }
              title={model.name}
              meta={`Ajouté le ${new Date(model.created_at).toLocaleDateString('fr-FR')}`}
              badges={
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-body font-medium ${
                    model.structure_summary
                      ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                      : 'bg-[var(--surface-warm)] text-[var(--ink-muted)]'
                  }`}
                >
                  {model.structure_summary ? 'Structure analysée' : 'Analyse en attente'}
                </span>
              }
              menuItems={[
                {
                  label: deletingId === model.id ? 'Suppression…' : 'Supprimer',
                  onClick: () => void handleDelete(model),
                  destructive: true,
                  disabled: deletingId === model.id,
                },
              ]}
            >
              {model.structure_summary ? (
                <SummaryPreview summary={model.structure_summary as StructureSummary} />
              ) : null}
            </TemplateItemCard>
          ))}
        </div>
      )}
    </div>
  )
}
