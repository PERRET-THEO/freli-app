import { useState } from 'react'
import { Button, Input } from '../ui'
import {
  BUILTIN_TEMPLATES,
  CHECKLIST_TYPE_OPTIONS,
  buildItemsFromSeeds,
  createDraftItem,
  duplicateItem,
  moveItem,
  type BuiltinTemplateKey,
  type ChecklistItemType,
  type DraftChecklistItem,
} from '../../lib/checklist'
import {
  loadChecklistTemplateItems,
  saveChecklistTemplate,
  type AgencyChecklistTemplate,
} from '../../lib/checklistTemplates'

type ContractTemplateOption = { id: string; name: string }

type ChecklistBuilderProps = {
  items: DraftChecklistItem[]
  onChange: (items: DraftChecklistItem[]) => void
  contractTemplates: ContractTemplateOption[]
  agencyTemplates: AgencyChecklistTemplate[]
  agencyId: string | null
  onTemplatesChanged: () => void
}

const selectCls =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

const smallSelectCls =
  'rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

const BUILTIN_KEYS = Object.keys(BUILTIN_TEMPLATES) as BuiltinTemplateKey[]

export function ChecklistBuilder({
  items,
  onChange,
  contractTemplates,
  agencyTemplates,
  agencyId,
  onTemplatesChanged,
}: ChecklistBuilderProps) {
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [newItemLabel, setNewItemLabel] = useState('')
  const [newItemType, setNewItemType] = useState<ChecklistItemType>('text')
  const [loadingTemplate, setLoadingTemplate] = useState(false)

  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const confirmOverwrite = () =>
    items.length === 0 ||
    window.confirm('Remplacer la checklist actuelle par ce modèle ?')

  const applyValue = async (value: string) => {
    if (!value) return
    if (value === '__empty__') {
      if (!confirmOverwrite()) return
      onChange([])
      return
    }
    if (value.startsWith('builtin:')) {
      if (!confirmOverwrite()) return
      const key = value.slice('builtin:'.length) as BuiltinTemplateKey
      onChange(buildItemsFromSeeds(BUILTIN_TEMPLATES[key].items))
      return
    }
    if (value.startsWith('agency:')) {
      if (!confirmOverwrite()) return
      const templateId = value.slice('agency:'.length)
      setLoadingTemplate(true)
      const loaded = await loadChecklistTemplateItems(templateId)
      setLoadingTemplate(false)
      onChange(loaded)
    }
  }

  const handleTemplateChange = async (value: string) => {
    setSelectedTemplate('')
    await applyValue(value)
  }

  const updateItem = (id: string, patch: Partial<DraftChecklistItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const addItem = (type: ChecklistItemType, label?: string) => {
    const resolvedLabel = (label ?? newItemLabel).trim()
    if (!resolvedLabel) return
    onChange([...items, createDraftItem(resolvedLabel, type)])
    setNewItemLabel('')
    setNewItemType('text')
  }

  const handleSaveTemplate = async () => {
    if (!agencyId) {
      setSaveError('Aucune agence trouvée.')
      return
    }
    if (!saveName.trim()) {
      setSaveError('Donne un nom à ton modèle.')
      return
    }
    if (!items.length) {
      setSaveError('La checklist est vide.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await saveChecklistTemplate(agencyId, saveName, items, saveDescription)
      setShowSaveModal(false)
      setSaveName('')
      setSaveDescription('')
      setSaveSuccess('Modèle enregistré.')
      onTemplatesChanged()
      window.setTimeout(() => setSaveSuccess(null), 2500)
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Erreur lors de l\u2019enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          className={selectCls}
          value={selectedTemplate}
          onChange={(event) => handleTemplateChange(event.target.value)}
          disabled={loadingTemplate}
        >
          <option value="">{loadingTemplate ? 'Chargement…' : 'Choisir un modèle…'}</option>
          <optgroup label="Modèles Freli">
            {BUILTIN_KEYS.map((key) => (
              <option key={key} value={`builtin:${key}`}>
                {BUILTIN_TEMPLATES[key].label}
              </option>
            ))}
          </optgroup>
          {agencyTemplates.length > 0 && (
            <optgroup label="Mes modèles">
              {agencyTemplates.map((tpl) => (
                <option key={tpl.id} value={`agency:${tpl.id}`}>
                  {tpl.name} ({tpl.itemCount})
                </option>
              ))}
            </optgroup>
          )}
          <option value="__empty__">Checklist vide</option>
        </select>
        <Button
          variant="secondary"
          onClick={() => {
            setSaveError(null)
            setShowSaveModal(true)
          }}
          disabled={!items.length}
        >
          Enregistrer comme modèle
        </Button>
      </div>

      {saveSuccess ? (
        <p className="mt-2 text-sm font-body text-[var(--mint)]">{saveSuccess}</p>
      ) : null}

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm font-body text-[var(--ink-muted)]">
            Checklist vide. Choisis un modèle ou ajoute des items ci-dessous.
          </p>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className="flex-1"
                  value={item.label}
                  placeholder="Libellé de l'item"
                  onChange={(e) => updateItem(item.id, { label: e.target.value })}
                />
                <select
                  className={smallSelectCls}
                  value={item.type}
                  onChange={(e) =>
                    updateItem(item.id, {
                      type: e.target.value as ChecklistItemType,
                      contractTemplateId: null,
                    })
                  }
                >
                  {CHECKLIST_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChange(moveItem(items, item.id, 'up'))}
                    disabled={index === 0}
                    className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                    aria-label="Monter"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(moveItem(items, item.id, 'down'))}
                    disabled={index === items.length - 1}
                    className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                    aria-label="Descendre"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange([...items, duplicateItem(item)])}
                    className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    aria-label="Dupliquer"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((it) => it.id !== item.id))}
                    className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    aria-label="Supprimer cet item"
                  >
                    ×
                  </button>
                </div>
              </div>

              {item.type === 'signature' && (
                <div className="mt-2">
                  <p className="text-xs font-body text-[var(--ink-muted)]">Contrat à faire signer :</p>
                  <select
                    className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)]"
                    value={item.contractTemplateId ?? ''}
                    onChange={(e) => updateItem(item.id, { contractTemplateId: e.target.value || null })}
                  >
                    <option value="">Aucun contrat (signature simple)</option>
                    {contractTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-warm)] p-4">
        <p className="mb-2 text-sm font-body font-medium text-[var(--ink)]">Ajouter un item</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            className="flex-1"
            placeholder="Libellé du nouvel item"
            value={newItemLabel}
            onChange={(event) => setNewItemLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addItem(newItemType)
              }
            }}
          />
          <select
            className={smallSelectCls}
            value={newItemType}
            onChange={(e) => setNewItemType(e.target.value as ChecklistItemType)}
          >
            {CHECKLIST_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => addItem(newItemType)}>
            Ajouter
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addItem('text', 'Nouvel item texte')}
            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            + Texte
          </button>
          <button
            type="button"
            onClick={() => addItem('file', 'Nouveau fichier à fournir')}
            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            + Fichier
          </button>
          <button
            type="button"
            onClick={() => addItem('signature', 'Document à signer')}
            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            + Signature
          </button>
        </div>
      </div>

      {showSaveModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/45 px-4">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--white)] p-7 shadow-[0_2px_16px_rgba(13,15,20,0.12)]">
            <h2 className="font-display text-2xl font-bold text-[var(--ink)]">Enregistrer le modèle</h2>
            <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
              Réutilise cette checklist ({items.length} item{items.length > 1 ? 's' : ''}) pour tes prochains projets.
            </p>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="Nom du modèle"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
              <textarea
                placeholder="Description (optionnel)"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                rows={2}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
              {saveError ? <p className="text-sm font-body text-[var(--amber)]">{saveError}</p> : null}
            </div>
            <div className="mt-5 flex gap-3">
              <Button onClick={handleSaveTemplate} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button variant="secondary" onClick={() => setShowSaveModal(false)} disabled={saving}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
