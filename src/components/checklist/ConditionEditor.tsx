import type { DraftChecklistItem } from '../../lib/checklist'
import { getEligibleConditionSources } from '../../lib/checklistConditions'

type ConditionEditorProps = {
  item: DraftChecklistItem
  items: DraftChecklistItem[]
  index: number
  onChange: (patch: Partial<DraftChecklistItem>) => void
}

const selectCls =
  'rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none'

/**
 * Rend une étape conditionnelle : « afficher si <étape Choix> = <option> ».
 * N'apparaît que s'il existe une étape « Choix » utilisable au-dessus.
 */
export function ConditionEditor({ item, items, index, onChange }: ConditionEditorProps) {
  const sources = getEligibleConditionSources(items, index)
  if (sources.length === 0) return null

  const condition = item.visibleWhen ?? null
  const source = condition ? sources.find((entry) => entry.id === condition.itemId) : null
  const options = (source?.choiceOptions ?? []).filter((option) => option.trim())

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <label className="flex items-center gap-2 text-xs font-body text-[var(--ink-soft)]">
        <input
          type="checkbox"
          checked={condition !== null}
          onChange={(event) => {
            if (!event.target.checked) {
              onChange({ visibleWhen: null })
              return
            }
            const first = sources[0]
            const firstOption = (first.choiceOptions ?? []).find((option) => option.trim())
            onChange({ visibleWhen: { itemId: first.id, equals: firstOption ?? '' } })
          }}
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
        N&apos;afficher cette étape que sous condition
      </label>

      {condition ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-xs font-body text-[var(--ink-muted)]">Si</span>
          <select
            className={`${selectCls} min-w-0 flex-1`}
            value={condition.itemId}
            onChange={(event) => {
              const next = sources.find((entry) => entry.id === event.target.value)
              if (!next) return
              const firstOption = (next.choiceOptions ?? []).find((option) => option.trim())
              onChange({ visibleWhen: { itemId: next.id, equals: firstOption ?? '' } })
            }}
          >
            {sources.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label.trim() || 'Étape sans libellé'}
              </option>
            ))}
          </select>
          <span className="text-xs font-body text-[var(--ink-muted)]">vaut</span>
          <select
            className={`${selectCls} min-w-0 flex-1`}
            value={condition.equals}
            onChange={(event) =>
              onChange({ visibleWhen: { ...condition, equals: event.target.value } })
            }
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {condition ? (
        <p className="mt-1.5 text-xs font-body text-[var(--ink-muted)]">
          Masquée pour le client tant que la réponse ne correspond pas.
        </p>
      ) : null}
    </div>
  )
}
