import { useState } from 'react'
import { Button, Input } from '../ui'
import {
  BUILTIN_TEMPLATES,
  buildItemsFromSeeds,
  hasAiGenerateItems,
  type BuiltinTemplateKey,
  type DraftChecklistItem,
} from '../../lib/checklist'
import {
  loadChecklistTemplateItems,
  saveChecklistTemplate,
  type AgencyChecklistTemplate,
} from '../../lib/checklistTemplates'
import { ChecklistItemsEditor } from './ChecklistItemsEditor'

type ContractTemplateOption = { id: string; name: string }

type ChecklistBuilderProps = {
  items: DraftChecklistItem[]
  onChange: (items: DraftChecklistItem[]) => void
  contractTemplates: ContractTemplateOption[]
  agencyTemplates: AgencyChecklistTemplate[]
  agencyId: string | null
  onTemplatesChanged: () => void
  aiContractsEnabled?: boolean
  hasDefaultContract?: boolean
  defaultContractBrief?: string
  priceEur?: number | null
}

const selectCls =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

const BUILTIN_KEYS = Object.keys(BUILTIN_TEMPLATES) as BuiltinTemplateKey[]

export function ChecklistBuilder({
  items,
  onChange,
  contractTemplates,
  agencyTemplates,
  agencyId,
  onTemplatesChanged,
  aiContractsEnabled = false,
  hasDefaultContract = false,
  defaultContractBrief = '',
  priceEur = null,
}: ChecklistBuilderProps) {
  const [selectedTemplate, setSelectedTemplate] = useState('')
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
    <div className="min-w-0">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <select
          className={`${selectCls} min-w-0 flex-1`}
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

      {items.some((item) => item.type === 'signature' && !item.contractSource) ? (
        <p className="mt-2 rounded-[var(--radius-sm)] border border-[var(--amber)]/40 bg-[var(--amber-soft)] px-3 py-2 text-xs font-body text-[var(--amber)]">
          Configure le contrat pour chaque étape « Contrat à signer » ci-dessous.
        </p>
      ) : null}

      {hasAiGenerateItems(items) ? (
        <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
          Un contrat sera généré par l&apos;IA à l&apos;étape suivante. Vous pourrez le régénérer
          après avoir ajusté la checklist, tant que l&apos;invitation n&apos;est pas envoyée.
        </p>
      ) : null}

      <div className="mt-4">
        <ChecklistItemsEditor
          items={items}
          onChange={onChange}
          contractTemplates={contractTemplates}
          aiContractsEnabled={aiContractsEnabled}
          hasDefaultContract={hasDefaultContract}
          defaultContractBrief={defaultContractBrief}
          priceEur={priceEur}
        />
      </div>

      {showSaveModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/45 px-4">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--white)] p-4 shadow-[0_2px_16px_rgba(13,15,20,0.12)] sm:p-7">
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
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
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
