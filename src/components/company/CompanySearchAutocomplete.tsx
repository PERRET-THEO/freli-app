import { useEffect, useRef, useState } from 'react'
import {
  isSirenOrSiret,
  searchCompanies,
  type CompanyLookupResult,
} from '../../lib/companyLookup'

const DEBOUNCE_MS = 450

type CompanySearchAutocompleteProps = {
  label?: string
  placeholder?: string
  onSelect: (company: CompanyLookupResult) => void
  disabled?: boolean
  /** Affiche un bouton "Rafraîchir" qui relance la recherche sur currentSiren. */
  showRefresh?: boolean
  currentSiren?: string | null
}

export function CompanySearchAutocomplete({
  label,
  placeholder = "Nom de l'entreprise ou SIRET/SIREN",
  onSelect,
  disabled = false,
  showRefresh = false,
  currentSiren = null,
}: CompanySearchAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CompanyLookupResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }

    const seq = ++requestSeq.current
    setLoading(true)
    // Recherche immédiate si SIREN/SIRET complet, sinon debounce pendant la frappe.
    const delay = isSirenOrSiret(trimmed) ? 0 : DEBOUNCE_MS
    const timer = window.setTimeout(async () => {
      const outcome = await searchCompanies(trimmed)
      if (seq !== requestSeq.current) return
      setLoading(false)
      setUnavailable(outcome.unavailable)
      setResults(outcome.results)
      setHighlighted(-1)
      setOpen(true)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectResult = (company: CompanyLookupResult) => {
    setQuery('')
    setResults([])
    setOpen(false)
    onSelect(company)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (event.key === 'Escape') setOpen(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((h) => (h + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((h) => (h <= 0 ? results.length - 1 : h - 1))
    } else if (event.key === 'Enter') {
      if (highlighted >= 0 && highlighted < results.length) {
        event.preventDefault()
        selectResult(results[highlighted])
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const handleRefresh = async () => {
    if (!currentSiren) return
    setRefreshing(true)
    setUnavailable(false)
    const outcome = await searchCompanies(currentSiren, { refresh: true })
    setRefreshing(false)
    if (outcome.unavailable) {
      setUnavailable(true)
      return
    }
    if (outcome.results.length > 0) {
      onSelect(outcome.results[0])
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {label ? (
        <label className="mb-1.5 block text-sm font-body font-medium text-[var(--ink-soft)]">
          {label}
        </label>
      ) : null}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="company-search-listbox"
            type="text"
            value={query}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0) setOpen(true)
            }}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 font-body text-base text-[var(--ink)] placeholder-[var(--ink-muted)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
          {loading ? (
            <span className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          ) : null}
        </div>
        {showRefresh ? (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={!currentSiren || refreshing || disabled}
            title={
              currentSiren
                ? 'Relancer la recherche sur votre SIREN pour mettre à jour les données'
                : "Renseignez d'abord un SIREN via la recherche"
            }
            className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm font-body text-[var(--ink-soft)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? 'Actualisation…' : '↻ Rafraîchir'}
          </button>
        ) : null}
      </div>

      {unavailable ? (
        <p className="mt-1.5 text-xs font-body text-[var(--ink-muted)]">
          Recherche automatique indisponible, merci de compléter manuellement.
        </p>
      ) : null}

      {open && !unavailable ? (
        <ul
          id="company-search-listbox"
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] shadow-lg"
        >
          {results.length === 0 && !loading ? (
            <li className="px-4 py-3 text-sm font-body text-[var(--ink-muted)]">
              Aucune entreprise trouvée. Vous pouvez saisir les informations manuellement.
            </li>
          ) : (
            results.map((company, index) => (
              <li
                key={`${company.siren}-${company.siret}`}
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectResult(company)
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={`cursor-pointer px-4 py-2.5 transition ${index === highlighted ? 'bg-[var(--accent-soft)]' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-body font-medium text-[var(--ink)]">
                    {company.raison_sociale}
                  </span>
                  {company.etat_administratif && company.etat_administratif !== 'A' ? (
                    <span className="shrink-0 rounded-full bg-[var(--surface-warm)] px-2 py-0.5 text-[10px] font-body text-[var(--ink-muted)]">
                      Entreprise fermée
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs font-body text-[var(--ink-muted)]">
                  {[company.ville, `SIREN ${company.siren}`].filter(Boolean).join(' — ')}
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
