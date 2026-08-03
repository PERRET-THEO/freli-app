import { useRef, type KeyboardEvent } from 'react'
import {
  ATTENTION_VIEWS,
  type AttentionView,
  countAttentionViews,
} from '../../lib/projectAttention'
import { FILTER_LABELS, FILTER_SHORT_LABELS, type ProjectCardData } from './types'

type StatusFilterBarProps = {
  view: AttentionView
  onViewChange: (view: AttentionView) => void
  projects: ProjectCardData[]
  now: number
  resultsId: string
}

export function StatusFilterBar({
  view,
  onViewChange,
  projects,
  now,
  resultsId,
}: StatusFilterBarProps) {
  const counts = countAttentionViews(projects, now)
  const radiosRef = useRef<Array<HTMLButtonElement | null>>([])

  const focusRadio = (index: number) => {
    const el = radiosRef.current[index]
    el?.focus()
  }

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = ATTENTION_VIEWS.length - 1
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      next = index === last ? 0 : index + 1
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      next = index === 0 ? last : index - 1
    } else if (event.key === 'Home') {
      event.preventDefault()
      next = 0
    } else if (event.key === 'End') {
      event.preventDefault()
      next = last
    } else {
      return
    }
    onViewChange(ATTENTION_VIEWS[next])
    focusRadio(next)
  }

  return (
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="radiogroup"
      aria-label="Filtrer les projets"
    >
      {ATTENTION_VIEWS.map((key, index) => {
        const selected = view === key
        return (
          <button
            key={key}
            ref={(node) => {
              radiosRef.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-controls={resultsId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onViewChange(key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`nav-filter-pill shrink-0 rounded-full px-3 py-1.5 text-sm font-body transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] ${
              selected
                ? 'bg-[var(--accent)] font-semibold text-[var(--white)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]'
                : 'border border-[var(--border)] bg-[var(--white)] text-[var(--ink-soft)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]'
            }`}
          >
            <span className="sm:hidden">{FILTER_SHORT_LABELS[key]}</span>
            <span className="hidden sm:inline">{FILTER_LABELS[key]}</span>{' '}
            <span
              className={`tabular-nums ${selected ? 'text-white/80' : 'text-[var(--ink-muted)]'}`}
            >
              ({counts[key]})
            </span>
          </button>
        )
      })}
    </div>
  )
}
