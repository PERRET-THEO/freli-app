import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { FieldSaveStatus } from '../../hooks/useClientFieldSave'

type ClientPropertyRowProps = {
  label: string
  value: string | null | undefined
  displayValue?: ReactNode
  emptyLabel?: string
  multiline?: boolean
  inputType?: 'text' | 'email' | 'tel' | 'url'
  status?: FieldSaveStatus
  error?: string
  readOnly?: boolean
  onCommit: (raw: string) => void | Promise<boolean | void>
  onDraftChange?: (raw: string) => void
  onCancelEdit?: () => void
}

export function ClientPropertyRow({
  label,
  value,
  displayValue,
  emptyLabel = '—',
  multiline = false,
  inputType = 'text',
  status = 'idle',
  error,
  readOnly = false,
  onCommit,
  onDraftChange,
  onCancelEdit,
}: ClientPropertyRowProps) {
  const inputId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => value ?? '')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const ignoreBlurRef = useRef(false)
  const draftRef = useRef(draft)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
  }, [editing])

  const statusLabel =
    status === 'saving'
      ? 'Enregistrement…'
      : status === 'saved'
        ? 'Enregistré'
        : status === 'error'
          ? error ?? 'Échec'
          : ''

  const startEdit = () => {
    if (readOnly) return
    setDraft(value ?? '')
    setEditing(true)
  }

  const commit = async () => {
    setEditing(false)
    await onCommit(draftRef.current)
  }

  const cancelEdit = () => {
    ignoreBlurRef.current = true
    setDraft(value ?? '')
    setEditing(false)
    onCancelEdit?.()
  }

  return (
    <div className="group min-w-0 border-b border-[var(--border)]/70 py-2 last:border-b-0">
      <div className="flex min-h-9 items-start gap-3">
        <label
          htmlFor={editing ? inputId : undefined}
          className="w-[5.5rem] shrink-0 pt-1.5 text-xs font-body font-medium text-[var(--ink-muted)] sm:w-28"
        >
          {label}
        </label>
        <div className="min-w-0 flex-1">
          {editing ? (
            multiline ? (
              <textarea
                id={inputId}
                ref={(node) => {
                  inputRef.current = node
                }}
                value={draft}
                rows={3}
                aria-invalid={status === 'error'}
                onChange={(event) => {
                  setDraft(event.target.value)
                  onDraftChange?.(event.target.value)
                }}
                onBlur={() => {
                  if (ignoreBlurRef.current) {
                    ignoreBlurRef.current = false
                    return
                  }
                  void commit()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelEdit()
                  }
                }}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--accent)] bg-[var(--white)] px-2.5 py-1.5 text-sm font-body text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              />
            ) : (
              <input
                id={inputId}
                ref={(node) => {
                  inputRef.current = node
                }}
                type={inputType}
                value={draft}
                aria-invalid={status === 'error'}
                onChange={(event) => {
                  setDraft(event.target.value)
                  onDraftChange?.(event.target.value)
                }}
                onBlur={() => {
                  if (ignoreBlurRef.current) {
                    ignoreBlurRef.current = false
                    return
                  }
                  void commit()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void commit()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelEdit()
                  }
                }}
                className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--accent)] bg-[var(--white)] px-2.5 text-sm font-body text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              />
            )
          ) : (
            <div className="flex min-h-9 items-center gap-2">
              <div
                className={`min-w-0 flex-1 truncate text-sm font-body ${value?.trim() ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}
              >
                {displayValue ?? (value?.trim() ? value : emptyLabel)}
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={startEdit}
                  className="shrink-0 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-body font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  Modifier
                </button>
              ) : null}
            </div>
          )}
          <p className="sr-only" aria-live="polite">
            {statusLabel}
          </p>
          {statusLabel && status !== 'idle' ? (
            <p
              className={`mt-0.5 text-[11px] font-body ${
                status === 'error' ? 'text-[#EF4444]' : 'text-[var(--ink-muted)]'
              }`}
            >
              {statusLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
