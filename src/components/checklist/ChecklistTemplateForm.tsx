import { useEffect, useState } from 'react'
import { Button, Card, Input } from '../ui'
import {
  BUILTIN_TEMPLATES,
  buildItemsFromSeeds,
  validateChecklist,
  type BuiltinTemplateKey,
  type DraftChecklistItem,
} from '../../lib/checklist'
import {
  loadChecklistTemplateItems,
  saveChecklistTemplate,
  updateChecklistTemplate,
  type AgencyChecklistTemplate,
} from '../../lib/checklistTemplates'
import { ChecklistItemsEditor } from './ChecklistItemsEditor'

type ContractTemplateOption = { id: string; name: string }

const selectCls =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

const BUILTIN_KEYS = Object.keys(BUILTIN_TEMPLATES) as BuiltinTemplateKey[]

export type ChecklistTemplateFormProps = {
  mode: 'create' | 'edit'
  agencyId: string
  contractTemplates: ContractTemplateOption[]
  agencyTemplates: AgencyChecklistTemplate[]
  initialTemplate?: AgencyChecklistTemplate
  onClose: () => void
  onSaved: () => void
}

export function ChecklistTemplateForm({
  mode,
  agencyId,
  contractTemplates,
  agencyTemplates,
  initialTemplate,
  onClose,
  onSaved,
}: ChecklistTemplateFormProps) {
  const [name, setName] = useState(initialTemplate?.name ?? '')
  const [description, setDescription] = useState(initialTemplate?.description ?? '')
  const [items, setItems] = useState<DraftChecklistItem[]>([])
  const [starterValue, setStarterValue] = useState('')
  const [loadingItems, setLoadingItems] = useState(mode === 'edit')
  const [loadingStarter, setLoadingStarter] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'edit' || !initialTemplate) return
    let cancelled = false
    void (async () => {
      setLoadingItems(true)
      const loaded = await loadChecklistTemplateItems(initialTemplate.id)
      if (!cancelled) {
        setItems(loaded)
        setLoadingItems(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, initialTemplate])

  const confirmOverwrite = () =>
    items.length === 0 ||
    window.confirm('Remplacer les items actuels par ce modèle de départ ?')

  const applyStarter = async (value: string) => {
    if (!value) return
    if (value === '__empty__') {
      if (!confirmOverwrite()) return
      setItems([])
      return
    }
    if (value.startsWith('builtin:')) {
      if (!confirmOverwrite()) return
      const key = value.slice('builtin:'.length) as BuiltinTemplateKey
      setItems(buildItemsFromSeeds(BUILTIN_TEMPLATES[key].items))
      return
    }
    if (value.startsWith('agency:')) {
      if (!confirmOverwrite()) return
      const templateId = value.slice('agency:'.length)
      if (mode === 'edit' && initialTemplate?.id === templateId) return
      setLoadingStarter(true)
      const loaded = await loadChecklistTemplateItems(templateId)
      setLoadingStarter(false)
      setItems(loaded)
    }
  }

  const handleStarterChange = async (value: string) => {
    setStarterValue('')
    await applyStarter(value)
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Donne un nom à ton modèle.')
      return
    }
    const validationError = validateChecklist(items, { context: 'template' })
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        await saveChecklistTemplate(agencyId, name, items, description)
      } else if (initialTemplate) {
        await updateChecklistTemplate(initialTemplate.id, name, items, description)
      }
      onSaved()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erreur lors de l\u2019enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  const otherAgencyTemplates = agencyTemplates.filter(
    (tpl) => mode !== 'edit' || tpl.id !== initialTemplate?.id,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/45 px-4 py-6">
      <Card className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="shrink-0">
          <h2 className="font-display text-2xl font-bold text-[var(--ink)]">
            {mode === 'create' ? 'Nouveau modèle de checklist' : 'Modifier le modèle'}
          </h2>
          <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
            Composez les étapes réutilisables pour vos futurs projets.
          </p>
        </div>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
          <Input
            placeholder="Nom du modèle"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
          />

          {mode === 'create' ? (
            <div>
              <p className="mb-2 text-sm font-body font-medium text-[var(--ink)]">
                Partir d&apos;un modèle existant
              </p>
              <select
                className={selectCls}
                value={starterValue}
                onChange={(e) => handleStarterChange(e.target.value)}
                disabled={loadingStarter}
              >
                <option value="">
                  {loadingStarter ? 'Chargement…' : 'Choisir un point de départ (optionnel)…'}
                </option>
                <optgroup label="Modèles Freli">
                  {BUILTIN_KEYS.map((key) => (
                    <option key={key} value={`builtin:${key}`}>
                      {BUILTIN_TEMPLATES[key].label}
                    </option>
                  ))}
                </optgroup>
                {otherAgencyTemplates.length > 0 && (
                  <optgroup label="Mes modèles">
                    {otherAgencyTemplates.map((tpl) => (
                      <option key={tpl.id} value={`agency:${tpl.id}`}>
                        {tpl.name} ({tpl.itemCount})
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="__empty__">Checklist vide</option>
              </select>
            </div>
          ) : null}

          {loadingItems ? (
            <p className="text-sm font-body text-[var(--ink-muted)]">Chargement des items…</p>
          ) : (
            <ChecklistItemsEditor
              items={items}
              onChange={setItems}
              contractTemplates={contractTemplates}
              emptyMessage="Aucun item. Ajoutez des étapes ci-dessous ou partez d'un modèle existant."
            />
          )}

          {error ? <p className="text-sm font-body text-[var(--amber)]">{error}</p> : null}
        </div>

        <div className="mt-5 flex shrink-0 gap-3 border-t border-[var(--border)] pt-4">
          <Button onClick={handleSubmit} disabled={saving || loadingItems}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
        </div>
      </Card>
    </div>
  )
}
