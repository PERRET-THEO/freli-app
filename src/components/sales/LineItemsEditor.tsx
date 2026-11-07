import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  formatMoney,
  formatVatRate,
  lineTotalHt,
  LINE_UNITS,
  validateLine,
  VAT_RATES,
} from '../../lib/salesDocuments'
import { newEditorLine, toDraftLine, type EditorLine } from '../../lib/salesEditorLines'

type LineItemsEditorProps = {
  lines: EditorLine[]
  onChange: (lines: EditorLine[]) => void
  readOnly: boolean
  vatExempt: boolean
  defaultVatRate: number
  showErrors: boolean
}

const fieldCls =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-2.5 py-2 font-body text-sm text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)]'

const labelCls = 'mb-1 block text-[11px] font-body font-medium text-[var(--ink-muted)]'

export function LineItemsEditor({
  lines,
  onChange,
  readOnly,
  vatExempt,
  defaultVatRate,
  showErrors,
}: LineItemsEditorProps) {
  const update = (id: string, patch: Partial<EditorLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id))
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= lines.length) return
    const next = [...lines]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const add = () => onChange([...lines, newEditorLine(vatExempt ? 0 : defaultVatRate)])

  return (
    <div>
      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm font-body text-[var(--ink-muted)]">
          Aucune ligne. Ajoutez une prestation pour commencer.
        </p>
      ) : null}

      <ol className="divide-y divide-[var(--border)]">
        {lines.map((line, index) => {
          const draft = toDraftLine(line)
          const error = showErrors ? validateLine(draft) : null
          const total = validateLine({ ...draft, description: draft.description || 'x' })
            ? null
            : lineTotalHt(draft)
          return (
            <li key={line.id} className="space-y-2 py-3" data-testid="line-row">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <label className={labelCls} htmlFor={`desc-${line.id}`}>
                    Désignation (ligne {index + 1})
                  </label>
                  <textarea
                    id={`desc-${line.id}`}
                    rows={line.description.length > 90 || line.description.includes('\n') ? 3 : 1}
                    className={`${fieldCls} resize-y`}
                    placeholder="Ex. Création de la maquette"
                    value={line.description}
                    disabled={readOnly}
                    maxLength={2000}
                    aria-invalid={Boolean(error && !line.description.trim()) || undefined}
                    onChange={(e) => update(line.id, { description: e.target.value })}
                  />
                </div>
                {readOnly ? null : (
                  <div className="flex shrink-0 items-center gap-0.5 pt-5">
                    <button
                      type="button"
                      className="rounded p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-30"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Monter la ligne ${index + 1}`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-30"
                      onClick={() => move(index, 1)}
                      disabled={index === lines.length - 1}
                      aria-label={`Descendre la ligne ${index + 1}`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-[var(--ink-muted)] hover:bg-[#fdecec] hover:text-[#c2410c]"
                      onClick={() => remove(line.id)}
                      aria-label={`Supprimer la ligne ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div
                className={`grid grid-cols-2 gap-2 ${
                  vatExempt
                    ? 'sm:grid-cols-[5rem_6.5rem_8rem_5.5rem_minmax(0,1fr)]'
                    : 'sm:grid-cols-[5rem_6.5rem_8rem_5.5rem_5.5rem_minmax(0,1fr)]'
                }`}
              >
                <div>
                  <label className={labelCls} htmlFor={`qty-${line.id}`}>
                    Quantité
                  </label>
                  <input
                    id={`qty-${line.id}`}
                    inputMode="decimal"
                    className={`${fieldCls} text-right tabular-nums`}
                    value={line.quantity}
                    disabled={readOnly}
                    onChange={(e) => update(line.id, { quantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor={`unit-${line.id}`}>
                    Unité
                  </label>
                  <input
                    id={`unit-${line.id}`}
                    list="sales-line-units"
                    className={fieldCls}
                    value={line.unit}
                    disabled={readOnly}
                    maxLength={30}
                    placeholder="—"
                    onChange={(e) => update(line.id, { unit: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor={`price-${line.id}`}>
                    Prix unitaire HT
                  </label>
                  <input
                    id={`price-${line.id}`}
                    inputMode="decimal"
                    className={`${fieldCls} text-right tabular-nums`}
                    placeholder="0,00"
                    value={line.unit_price_ht}
                    disabled={readOnly}
                    onChange={(e) => update(line.id, { unit_price_ht: e.target.value })}
                  />
                </div>
                {vatExempt ? null : (
                  <div>
                    <label className={labelCls} htmlFor={`vat-${line.id}`}>
                      TVA
                    </label>
                    <select
                      id={`vat-${line.id}`}
                      className={fieldCls}
                      value={String(line.vat_rate)}
                      disabled={readOnly}
                      onChange={(e) => update(line.id, { vat_rate: Number(e.target.value) })}
                    >
                      {VAT_RATES.map((rate) => (
                        <option key={rate} value={String(rate)}>
                          {formatVatRate(rate)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelCls} htmlFor={`disc-${line.id}`}>
                    Remise %
                  </label>
                  <input
                    id={`disc-${line.id}`}
                    inputMode="decimal"
                    className={`${fieldCls} text-right tabular-nums`}
                    placeholder="0"
                    value={line.discount_percent}
                    disabled={readOnly}
                    onChange={(e) => update(line.id, { discount_percent: e.target.value })}
                  />
                </div>
                <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:justify-end">
                  <span className="text-[11px] font-body font-medium text-[var(--ink-muted)]">Total HT</span>
                  <span
                    className="pb-2 font-body text-sm font-semibold tabular-nums text-[var(--ink)]"
                    data-testid="line-total"
                  >
                    {total == null ? '—' : formatMoney(total)}
                  </span>
                </div>
              </div>
              {error ? (
                <p className="text-xs font-body text-[#c2410c]" role="alert">
                  {error}
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>

      <datalist id="sales-line-units">
        {LINE_UNITS.filter(Boolean).map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      {readOnly ? null : (
        <button
          type="button"
          onClick={add}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-2 text-sm font-body font-medium text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
        >
          <Plus className="h-4 w-4" /> Ajouter une ligne
        </button>
      )}
    </div>
  )
}
