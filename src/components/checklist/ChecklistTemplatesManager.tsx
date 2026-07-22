import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui'
import { getOrCreateAgency } from '../../lib/agency'
import { supabase } from '../../lib/supabase'
import { CHECKLIST_TYPE_LABELS, type DraftChecklistItem } from '../../lib/checklist'
import {
  deleteChecklistTemplate,
  listAgencyChecklistTemplates,
  loadChecklistTemplateItems,
  type AgencyChecklistTemplate,
} from '../../lib/checklistTemplates'
import {
  TemplateCardFooterButton,
  TemplateEmptyState,
  TemplateIntroCard,
  TemplateItemCard,
  TemplatesGridSkeleton,
} from '../templates'
import { ChecklistTemplateForm } from './ChecklistTemplateForm'

type ContractTemplateOption = { id: string; name: string }

type ChecklistTemplatesManagerProps = {
  agencyId: string | null
  agencyLoading?: boolean
  contractTemplates: ContractTemplateOption[]
  onActionsReady?: (actions: { openCreate: () => void }) => void
}

export function ChecklistTemplatesManager({
  agencyId: agencyIdProp,
  agencyLoading = false,
  contractTemplates,
  onActionsReady,
}: ChecklistTemplatesManagerProps) {
  const [agencyId, setAgencyId] = useState<string | null>(agencyIdProp)
  const resolvedAgencyId = agencyIdProp ?? agencyId
  const [templates, setTemplates] = useState<AgencyChecklistTemplate[]>([])
  const [lastFetchedAgencyId, setLastFetchedAgencyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previewItems, setPreviewItems] = useState<DraftChecklistItem[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<AgencyChecklistTemplate | null>(null)

  const refreshTemplates = useCallback(async (id: string) => {
    const data = await listAgencyChecklistTemplates(id)
    setTemplates(data)
  }, [])

  useEffect(() => {
    if (!resolvedAgencyId) {
      return
    }
    let cancelled = false
    listAgencyChecklistTemplates(resolvedAgencyId)
      .then((data) => {
        if (!cancelled) {
          setTemplates(data)
          setLastFetchedAgencyId(resolvedAgencyId)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [resolvedAgencyId])

  const loading =
    agencyLoading || (!!resolvedAgencyId && lastFetchedAgencyId !== resolvedAgencyId)

  useEffect(() => {
    if (agencyIdProp || agencyId) return

    let cancelled = false
    void (async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user || cancelled) {
        return
      }
      const agency = await getOrCreateAgency(userData.user.id)
      if (!agency?.id || cancelled) {
        return
      }
      setAgencyId(agency.id)
    })()

    return () => {
      cancelled = true
    }
  }, [agencyIdProp, agencyId])

  const openCreate = useCallback(() => {
    setEditingTemplate(null)
    setFormMode('create')
  }, [])

  useEffect(() => {
    onActionsReady?.({ openCreate })
  }, [onActionsReady, openCreate])

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

  const openEdit = (template: AgencyChecklistTemplate) => {
    setEditingTemplate(template)
    setFormMode('edit')
  }

  const closeForm = () => {
    setFormMode(null)
    setEditingTemplate(null)
  }

  const handleSaved = async () => {
    if (resolvedAgencyId) await refreshTemplates(resolvedAgencyId)
  }

  const handleDelete = async (template: AgencyChecklistTemplate) => {
    if (!window.confirm(`Supprimer le modèle "${template.name}" ?`)) return
    setError(null)
    try {
      await deleteChecklistTemplate(template.id)
      if (expandedId === template.id) setExpandedId(null)
      if (resolvedAgencyId) await refreshTemplates(resolvedAgencyId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de supprimer ce modèle.')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <TemplateIntroCard
          title="Modèles de checklist"
          description="Créez des checklists réutilisables pour accélérer la création de vos projets d'onboarding."
        />
        <TemplatesGridSkeleton />
      </div>
    )
  }

  if (!resolvedAgencyId) {
    return (
      <TemplateEmptyState
        icon="⚙️"
        title="Agence non configurée"
        description="Complétez vos paramètres avant de créer des modèles de checklist."
      />
    )
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm font-body text-[var(--amber)]">{error}</p> : null}

      <TemplateIntroCard
        title="Modèles de checklist"
        description="Créez des checklists réutilisables pour accélérer la création de vos projets d'onboarding."
        countLabel={`${templates.length} modèle${templates.length !== 1 ? 's' : ''}`}
      />

      {templates.length === 0 ? (
        <TemplateEmptyState
          icon="✓"
          title="Aucun modèle de checklist"
          description="Créez votre premier modèle pour le réutiliser lors de la création de projets."
          action={<Button onClick={openCreate}>Nouveau modèle</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((template) => {
            const isExpanded = expandedId === template.id
            return (
              <TemplateItemCard
                key={template.id}
                icon={
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--mint-soft)] font-display text-sm font-extrabold text-[var(--mint)]">
                    ✓
                  </div>
                }
                title={template.name}
                meta={`${template.itemCount} item${template.itemCount > 1 ? 's' : ''} · Créé le ${new Date(template.created_at).toLocaleDateString('fr-FR')}`}
                badges={
                  template.description ? (
                    <span className="text-sm font-body text-[var(--ink-soft)]">{template.description}</span>
                  ) : undefined
                }
                menuItems={[
                  {
                    label: 'Supprimer',
                    onClick: () => void handleDelete(template),
                    destructive: true,
                  },
                ]}
                footer={
                  <>
                    <TemplateCardFooterButton
                      onClick={() => void togglePreview(template.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? 'Masquer' : 'Aperçu'}
                    </TemplateCardFooterButton>
                    <TemplateCardFooterButton onClick={() => openEdit(template)}>
                      Modifier
                    </TemplateCardFooterButton>
                  </>
                }
              >
                {isExpanded ? (
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-warm)] p-3">
                    {previewLoading ? (
                      <p className="text-xs font-body text-[var(--ink-muted)]">Chargement…</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {previewItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-2 text-sm font-body text-[var(--ink)]"
                          >
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
              </TemplateItemCard>
            )
          })}
        </div>
      )}

      {formMode ? (
        <ChecklistTemplateForm
          mode={formMode}
          agencyId={resolvedAgencyId}
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
