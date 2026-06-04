import { useEffect, useState } from 'react'
import { Button, Card, Input } from '../ui'
import { getOrCreateAgency } from '../../lib/agency'
import { supabase } from '../../lib/supabase'
import { CHECKLIST_TYPE_LABELS, type DraftChecklistItem } from '../../lib/checklist'
import {
  deleteChecklistTemplate,
  listAgencyChecklistTemplates,
  loadChecklistTemplateItems,
  renameChecklistTemplate,
  type AgencyChecklistTemplate,
} from '../../lib/checklistTemplates'

export function ChecklistTemplatesManager() {
  const [templates, setTemplates] = useState<AgencyChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previewItems, setPreviewItems] = useState<DraftChecklistItem[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const [editing, setEditing] = useState<AgencyChecklistTemplate | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    setLoading(true)
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
    setTemplates(await listAgencyChecklistTemplates(agency.id))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

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
    setEditing(template)
    setEditName(template.name)
    setEditDescription(template.description ?? '')
  }

  const handleRename = async () => {
    if (!editing || !editName.trim()) return
    setSavingEdit(true)
    try {
      await renameChecklistTemplate(editing.id, editName, editDescription)
      setEditing(null)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erreur lors du renommage.')
    } finally {
      setSavingEdit(false)
    }
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

  return (
    <div>
      {error ? <p className="mb-4 text-sm font-body text-[var(--amber)]">{error}</p> : null}

      {templates.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm font-body text-[var(--ink-muted)]">
            Aucun modèle de checklist. Enregistrez-en un depuis la création d&apos;un projet.
          </p>
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
                  Renommer
                </Button>
                <Button variant="secondary" onClick={() => handleDelete(template)}>
                  Supprimer
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/45 px-4">
          <Card className="w-full max-w-md">
            <h2 className="font-display text-2xl font-bold text-[var(--ink)]">Renommer le modèle</h2>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="Nom du modèle"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <textarea
                placeholder="Description (optionnel)"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <div className="mt-5 flex gap-3">
              <Button onClick={handleRename} disabled={savingEdit}>
                {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
                Annuler
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
