import { useState } from 'react'
import { Button, Input } from '../ui'
import {
  CHECKLIST_TYPE_OPTIONS,
  createDraftItem,
  duplicateItem,
  moveItem,
  type ChecklistItemType,
  type DraftChecklistItem,
} from '../../lib/checklist'

type ContractTemplateOption = { id: string; name: string }

const smallSelectCls =
  'rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

type ChecklistItemsEditorProps = {
  items: DraftChecklistItem[]
  onChange: (items: DraftChecklistItem[]) => void
  contractTemplates: ContractTemplateOption[]
  emptyMessage?: string
}

export function ChecklistItemsEditor({
  items,
  onChange,
  contractTemplates,
  emptyMessage = 'Checklist vide. Choisis un modèle ou ajoute des items ci-dessous.',
}: ChecklistItemsEditorProps) {
  const [newItemLabel, setNewItemLabel] = useState('')
  const [newItemType, setNewItemType] = useState<ChecklistItemType>('text')

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
    </div>
  )
}
