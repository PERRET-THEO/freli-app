import { useState } from 'react'
import { Button, Input } from '../ui'
import {
  CHECKLIST_TYPE_OPTIONS,
  countAiGenerateItems,
  createDraftItem,
  duplicateItem,
  moveItem,
  type ChecklistItemType,
  type DraftChecklistItem,
} from '../../lib/checklist'
import { pruneInvalidConditions } from '../../lib/checklistConditions'
import { ConditionEditor } from './ConditionEditor'
import { ContractItemConfig } from './ContractItemConfig'
import { FieldItemConfig } from './FieldItemConfig'

type ContractTemplateOption = { id: string; name: string }

const smallSelectCls =
  'min-w-0 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] sm:w-auto sm:max-w-[12rem]'

const QUICK_ADD_ITEMS: { type: ChecklistItemType; label: string; defaultLabel: string }[] = [
  { type: 'text', label: 'Texte', defaultLabel: 'Nouvel item texte' },
  { type: 'file', label: 'Fichier', defaultLabel: 'Nouveau fichier à fournir' },
  { type: 'email', label: 'Email', defaultLabel: 'Email de contact' },
  { type: 'phone', label: 'Téléphone', defaultLabel: 'Téléphone de contact' },
  { type: 'url', label: 'Lien', defaultLabel: 'Lien à fournir' },
  { type: 'choice', label: 'Choix', defaultLabel: 'Choix à faire' },
  { type: 'signature', label: 'Contrat à signer', defaultLabel: 'Contrat à signer' },
  { type: 'payment', label: 'Paiement', defaultLabel: 'Régler l’acompte' },
  { type: 'schedule', label: 'Rendez-vous', defaultLabel: 'Réserver le rendez-vous de lancement' },
]

type ChecklistItemsEditorProps = {
  items: DraftChecklistItem[]
  onChange: (items: DraftChecklistItem[]) => void
  contractTemplates: ContractTemplateOption[]
  aiContractsEnabled?: boolean
  hasDefaultContract?: boolean
  defaultContractBrief?: string
  emptyMessage?: string
  priceEur?: number | null
}

export function ChecklistItemsEditor({
  items,
  onChange: emitChange,
  contractTemplates,
  aiContractsEnabled = false,
  hasDefaultContract = false,
  defaultContractBrief = '',
  emptyMessage = 'Checklist vide. Choisis un modèle ou ajoute des items ci-dessous.',
  priceEur = null,
}: ChecklistItemsEditorProps) {
  const [newItemLabel, setNewItemLabel] = useState('')
  const [newItemType, setNewItemType] = useState<ChecklistItemType>('text')

  /**
   * Déplacer, supprimer ou retyper une étape peut casser la condition d'une
   * autre : on nettoie à chaque mutation plutôt que d'interdire le geste.
   */
  const onChange = (next: DraftChecklistItem[]) => {
    emitChange(pruneInvalidConditions(next))
  }

  const updateItem = (id: string, patch: Partial<DraftChecklistItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const hasPaymentItem = items.some((item) => item.type === 'payment')

  const addItem = (type: ChecklistItemType, label?: string) => {
    const resolvedLabel = (label ?? newItemLabel).trim()
    if (!resolvedLabel) return
    if (type === 'payment' && hasPaymentItem) return
    if (type === 'signature' && countAiGenerateItems(items) >= 1) {
      onChange([
        ...items,
        createDraftItem(resolvedLabel, type, {
          contractSource: contractTemplates.length > 0 ? 'existing' : hasDefaultContract ? 'default' : 'existing',
          contractTemplateId: contractTemplates[0]?.id ?? null,
        }),
      ])
    } else if (type === 'signature') {
      onChange([
        ...items,
        createDraftItem(resolvedLabel, type, {
          contractSource: 'default',
          contractBrief: defaultContractBrief,
        }),
      ])
    } else {
      onChange([...items, createDraftItem(resolvedLabel, type)])
    }
    setNewItemLabel('')
    setNewItemType('text')
  }

  const aiItemCount = countAiGenerateItems(items)

  return (
    <div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm font-body text-[var(--ink-muted)]">
            {emptyMessage}
          </p>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-3"
            >
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className="min-w-0 flex-1"
                  value={item.label}
                  placeholder="Libellé de l'item"
                  onChange={(e) => updateItem(item.id, { label: e.target.value })}
                />
                <select
                  className={smallSelectCls}
                  value={item.type}
                  onChange={(e) => {
                    const nextType = e.target.value as ChecklistItemType
                    // Changer de type repart d'une config vierge : les réglages
                    // de l'ancien type ne s'appliquent jamais au nouveau.
                    const reset = {
                      type: nextType,
                      contractTemplateId: null,
                      contractSource: undefined,
                      contractBrief: undefined,
                      choiceOptions: undefined,
                      scheduleUrl: undefined,
                    } satisfies Partial<DraftChecklistItem>

                    if (nextType === 'signature') {
                      updateItem(item.id, {
                        ...reset,
                        contractSource: 'default',
                        contractBrief: defaultContractBrief,
                      })
                    } else if (nextType === 'choice') {
                      updateItem(item.id, { ...reset, choiceOptions: [] })
                    } else if (nextType === 'schedule') {
                      updateItem(item.id, { ...reset, scheduleUrl: '' })
                    } else {
                      updateItem(item.id, reset)
                    }
                  }}
                >
                  {CHECKLIST_TYPE_OPTIONS.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.value === 'payment' && hasPaymentItem && item.type !== 'payment'}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChange(moveItem(items, item.id, 'up'))}
                    disabled={index === 0}
                    className="touch-target shrink-0 rounded-full border border-[var(--border)] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                    aria-label="Monter"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(moveItem(items, item.id, 'down'))}
                    disabled={index === items.length - 1}
                    className="touch-target shrink-0 rounded-full border border-[var(--border)] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                    aria-label="Descendre"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange([...items, duplicateItem(item)])}
                    className="touch-target shrink-0 rounded-full border border-[var(--border)] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    aria-label="Dupliquer"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((it) => it.id !== item.id))}
                    className="touch-target shrink-0 rounded-full border border-[var(--border)] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    aria-label="Supprimer cet item"
                  >
                    ×
                  </button>
                </div>
              </div>

              {item.type === 'signature' ? (
                <ContractItemConfig
                  item={item}
                  contractTemplates={contractTemplates}
                  aiContractsEnabled={aiContractsEnabled}
                  hasDefaultContract={hasDefaultContract}
                  defaultBrief={defaultContractBrief}
                  hasOtherAiItem={
                    item.contractSource !== 'ai_generate' && aiItemCount >= 1
                  }
                  onChange={(patch) => updateItem(item.id, patch)}
                />
              ) : (
                <FieldItemConfig
                  item={item}
                  priceEur={priceEur}
                  onChange={(patch) => updateItem(item.id, patch)}
                />
              )}

              <ConditionEditor
                item={item}
                items={items}
                index={index}
                onChange={(patch) => updateItem(item.id, patch)}
              />
            </div>
          ))
        )}
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-warm)] p-4">
        <p className="mb-2 text-sm font-body font-medium text-[var(--ink)]">Ajouter un item</p>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
          <Input
            className="min-w-0 flex-1"
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
          {QUICK_ADD_ITEMS.map(({ type, label, defaultLabel }) => (
            <button
              key={type}
              type="button"
              onClick={() => addItem(type, defaultLabel)}
              disabled={type === 'payment' && hasPaymentItem}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--ink-muted)]"
            >
              + {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
