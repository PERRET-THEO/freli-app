import { useEffect, useState } from 'react'
import { Button, Card } from '../ui'
import { getOrCreateAgency } from '../../lib/agency'
import { supabase } from '../../lib/supabase'
import { CHECKLIST_TYPE_LABELS, type DraftChecklistItem } from '../../lib/checklist'
import {
  deleteChecklistTemplate,
  listAgencyChecklistTemplates,
  loadChecklistTemplateItems,
  type AgencyChecklistTemplate,
} from '../../lib/checklistTemplates'
import { ChecklistTemplateForm } from './ChecklistTemplateForm'

type ContractTemplateOption = { id: string; name: string }

type ChecklistTemplatesManagerProps = {
  agencyId: string | null
  contractTemplates: ContractTemplateOption[]
}

export function ChecklistTemplatesManager({
  agencyId: agencyIdProp,
  contractTemplates,
}: ChecklistTemplatesManagerProps) {
  const [agencyId, setAgencyId] = useState<string | null>(agencyIdProp)
  const [templates, setTemplates] = useState<AgencyChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previewItems, setPreviewItems] = useState<DraftChecklistItem[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<AgencyChecklistTemplate | null>(null)

  const load = async (resolvedAgencyId?: string) => {
    const id = resolvedAgencyId ?? agencyId
    if (!id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setTemplates(await listAgencyChecklistTemplates(id))
    setLoading(false)
  }

  useEffect(() => {
    if (agencyIdProp) {
      setAgencyId(agencyIdProp)
      void load(agencyIdProp)
      return
    }
    void (async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        setLoading(false)
        return
      }
      const agency = await getOrCreateAgency(userData.user.id)
      if (!agency?.id) {
        setLoading(false)
        return
      }
      setAgencyId(agency.id)
      await load(agency.id)
    })()
  }, [agencyIdProp])

  const togglePreview = async (templateId: string) => {
    if (expandedId === templateId) {
      setExpandedId(null)
      return
    }
    setExpandedId(templateId)
    setPreviewLoading(true)
    setPreviewItems(await loadChecklistTemplateItems(templateId))
    setPreviewLoading(false)
  }

  const openCreate = () => {
    setEditingTemplate(null)
    setFormMode('create')
  }

  const openEdit = (template: AgencyChecklistTemplate) => {
    setEditingTemplate(template)
    setFormMode('edit')
  }

  const closeForm = () => {
    setFormMode(null)
    setEditingTemplate(null)
  }

  const handleSaved = async () => {
    await load()
  }

  const handleDelete = async (template: AgencyChecklistTemplate) => {
    if (!window.confirm(`Supprimer le modèle "${template.name}" ?`)) return
    setError(null)
    try {
      await deleteChecklistTemplate(template.id)
      if (expandedId === template.id) setExpandedId(null)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de supprimer ce modèle.')
    }
  }

  if (loading) {
    return <p className="mt-6 text-sm font-body text-[var(--ink-muted)]">Chargement…</p>
  }

  if (!agencyId) {
    return (
      <Card className="text-center">
        <p className="text-sm font-body text-[var(--ink-muted)]">
          Aucune agence trouvée. Complétez vos paramètres avant de créer des modèles.
        </p>
      </Card>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        <Button onClick={openCreate}>Nouveau modèle</Button>
      </div>

      {error ? <p className="mb-4 text-sm font-body text-[var(--amber)]">{error}</p> : null}

      {templates.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm font-body text-[var(--ink-muted)]">
            Aucun modèle de checklist. Créez votre premier modèle pour le réutiliser lors de la création de projets.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            Nouveau modèle
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((template) => (
            <Card key={template.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xl font-semibold text-[var(--ink)]">{template.name}</p>
                  {template.description ? (
                    <p className="mt-1 text-sm font-body text-[var(--ink-soft)]">{template.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                    {template.itemCount} item{template.itemCount > 1 ? 's' : ''} · Créé le{' '}
                    {new Date(template.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>

              {expandedId === template.id ? (
                <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-warm)] p-3">
                  {previewLoading ? (
                    <p className="text-xs font-body text-[var(--ink-muted)]">Chargement…</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {previewItems.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2 text-sm font-body text-[var(--ink)]">
                          <span>{item.label}</span>
                          <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent)]">
                            {CHECKLIST_TYPE_LABELS[item.type]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => togglePreview(template.id)}>
                  {expandedId === template.id ? 'Masquer' : 'Aperçu'}
                </Button>
                <Button variant="secondary" onClick={() => openEdit(template)}>
                  Modifier
                </Button>
                <Button variant="secondary" onClick={() => handleDelete(template)}>
                  Supprimer
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {formMode ? (
        <ChecklistTemplateForm
          mode={formMode}
          agencyId={agencyId}
          contractTemplates={contractTemplates}
          agencyTemplates={templates}
          initialTemplate={editingTemplate ?? undefined}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  )
}
