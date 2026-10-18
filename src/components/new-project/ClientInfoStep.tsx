import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Input } from '../ui'
import { CompanySearchAutocomplete } from '../company/CompanySearchAutocomplete'
import type { CompanyLookupResult } from '../../lib/companyLookup'
import {
  formatExistingClientLabel,
  type ClientChangeSummary,
  type ClientWizardFieldErrors,
  type ClientWizardMode,
  type ExistingClientSnapshot,
} from '../../lib/clientWizard'
import type { ClientListRow } from '../../lib/clientListQuery'

const INDUSTRIES = [
  'Web & Digital', 'E-commerce', 'Immobilier', 'Industrie', 'Santé',
  'Education', 'Restauration', 'Mode & Luxe', 'Autre',
]

const COMPANY_TYPES = [
  'Auto-entrepreneur', 'EURL', 'SARL', 'SAS', 'SASU', 'SA', 'Association', 'Autre',
]

const COMPANY_SIZES = ['1 personne', '2-5', '6-20', '21-50', '50+']

const selectCls =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

const readonlyInputCls =
  'cursor-default border-[var(--border)] bg-[var(--surface-warm)] text-[var(--ink-soft)] focus:border-[var(--border)] focus:ring-0'

export type ConflictDecision = {
  resolution: 'attach' | 'update'
  client: ExistingClientSnapshot
  changes: ClientChangeSummary[]
}

type ClientInfoStepProps = {
  clientMode: ClientWizardMode
  onClientModeChange: (mode: ClientWizardMode) => void
  selectedClientId: string | null
  selectedClientLabel: string | null
  firstName: string
  lastName: string
  clientEmail: string
  phone: string
  isCompany: boolean
  companyName: string
  companyType: string
  siret: string
  vatNumber: string
  showExtra: boolean
  addressStreet: string
  postalCode: string
  city: string
  country: string
  website: string
  industry: string
  companySize: string
  notes: string
  projectName: string
  fieldErrors: ClientWizardFieldErrors
  error: string | null
  readOnly: boolean
  emailConflict: ExistingClientSnapshot | null
  conflictDecision: ConflictDecision | null
  mergeChanges: ClientChangeSummary[]
  emailLookupLoading: boolean
  clientSearchQuery: string
  clientSearchResults: ClientListRow[]
  clientSearchLoading: boolean
  onClientSearchQueryChange: (value: string) => void
  onSelectExistingClient: (clientId: string) => void
  onClearSelectedClient: () => void
  onEditExistingClient: () => void
  onConflictAttach: () => void
  onConflictUpdate: () => void
  onConflictCancel: () => void
  onConflictChangeDecision: () => void
  onFirstNameChange: (value: string) => void
  onLastNameChange: (value: string) => void
  onClientEmailChange: (value: string) => void
  onClientEmailBlur: () => void
  onPhoneChange: (value: string) => void
  onIsCompanyChange: (value: boolean) => void
  onCompanyNameChange: (value: string) => void
  onCompanyTypeChange: (value: string) => void
  onSiretChange: (value: string) => void
  onVatNumberChange: (value: string) => void
  onShowExtraToggle: () => void
  onAddressStreetChange: (value: string) => void
  onPostalCodeChange: (value: string) => void
  onCityChange: (value: string) => void
  onCountryChange: (value: string) => void
  onWebsiteChange: (value: string) => void
  onIndustryChange: (value: string) => void
  onCompanySizeChange: (value: string) => void
  onNotesChange: (value: string) => void
  onProjectNameChange: (value: string) => void
  onCompanySelect: (company: CompanyLookupResult) => void
  onLegalManualEdit: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-xs font-body text-[var(--amber)]" role="alert">
      {message}
    </p>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null
  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-36 shrink-0 text-xs font-body text-[var(--ink-muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-body text-[var(--ink)]">{value}</dd>
    </div>
  )
}

export function ClientInfoStep({
  clientMode,
  onClientModeChange,
  selectedClientId,
  selectedClientLabel,
  firstName,
  lastName,
  clientEmail,
  phone,
  isCompany,
  companyName,
  companyType,
  siret,
  vatNumber,
  showExtra,
  addressStreet,
  postalCode,
  city,
  country,
  website,
  industry,
  companySize,
  notes,
  projectName,
  fieldErrors,
  error,
  readOnly,
  emailConflict,
  conflictDecision,
  mergeChanges,
  emailLookupLoading,
  clientSearchQuery,
  clientSearchResults,
  clientSearchLoading,
  onClientSearchQueryChange,
  onSelectExistingClient,
  onClearSelectedClient,
  onEditExistingClient,
  onConflictAttach,
  onConflictUpdate,
  onConflictCancel,
  onConflictChangeDecision,
  onFirstNameChange,
  onLastNameChange,
  onClientEmailChange,
  onClientEmailBlur,
  onPhoneChange,
  onIsCompanyChange,
  onCompanyNameChange,
  onCompanyTypeChange,
  onSiretChange,
  onVatNumberChange,
  onShowExtraToggle,
  onAddressStreetChange,
  onPostalCodeChange,
  onCityChange,
  onCountryChange,
  onWebsiteChange,
  onIndustryChange,
  onCompanySizeChange,
  onNotesChange,
  onProjectNameChange,
  onCompanySelect,
  onLegalManualEdit,
  onSubmit,
}: ClientInfoStepProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const conflictRef = useRef<HTMLDivElement>(null)
  const firstErrorFocused = useRef<string | null>(null)
  const baseId = useId()
  const attachBtnId = `${baseId}-attach`
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [conflictHint, setConflictHint] = useState<string | null>(null)
  const [highlightConflict, setHighlightConflict] = useState(false)
  const [showDecisionChanges, setShowDecisionChanges] = useState(false)

  const pendingConflict = Boolean(emailConflict && clientMode === 'new' && !conflictDecision)
  const showClientForm =
    clientMode === 'new' || (clientMode === 'existing' && Boolean(selectedClientId))

  useEffect(() => {
    const order: (keyof ClientWizardFieldErrors)[] = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'projectName',
    ]
    const first = order.find((key) => fieldErrors[key])
    if (!first) {
      firstErrorFocused.current = null
      return
    }
    if (firstErrorFocused.current === first) return
    firstErrorFocused.current = first
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)
    el?.focus()
  }, [fieldErrors])

  const focusConflictBanner = () => {
    conflictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightConflict(true)
    window.setTimeout(() => setHighlightConflict(false), 1500)
    window.setTimeout(() => {
      document.getElementById(attachBtnId)?.focus()
    }, 100)
  }

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (pendingConflict) {
      event.preventDefault()
      setConflictHint('Choisissez une option dans l’encart ci-dessus pour continuer')
      focusConflictBanner()
      return
    }
    setConflictHint(null)
    onSubmit(event)
  }

  const disabled = readOnly
  const decisionName = conflictDecision
    ? formatExistingClientLabel(conflictDecision.client)
    : ''

  return (
    <form ref={formRef} className="mt-6 min-w-0 space-y-5" onSubmit={handleFormSubmit} noValidate>
      <div className="flex min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-1">
        {([
          ['existing', 'Client existant'],
          ['new', 'Nouveau client'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onClientModeChange(mode)}
            className={`min-h-11 flex-1 rounded-[var(--radius-sm)] px-3 text-sm font-body font-medium transition ${
              clientMode === mode
                ? 'bg-[var(--accent)] text-[var(--white)]'
                : 'text-[var(--ink-soft)] hover:bg-[var(--surface-warm)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {clientMode === 'existing' ? (
        <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
          <h3 className="font-display text-base font-semibold text-[var(--ink)]">Client</h3>
          {selectedClientId && selectedClientLabel ? (
            <div className="mt-3 flex min-w-0 items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2">
              <p className="min-w-0 flex-1 break-words text-sm font-body text-[var(--ink)]">
                {selectedClientLabel}
              </p>
              <button
                type="button"
                onClick={onClearSelectedClient}
                className="shrink-0 rounded px-2 py-1 text-sm font-body text-[var(--ink-muted)] hover:bg-[var(--white)] hover:text-[var(--ink)]"
                aria-label="Désélectionner le client"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                Recherchez un client par nom, email ou entreprise
              </p>
              <div className="relative mt-3">
                <Input
                  placeholder="Rechercher…"
                  value={clientSearchQuery}
                  onChange={(e) => {
                    onClientSearchQueryChange(e.target.value)
                    setShowSearchResults(true)
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  autoComplete="off"
                />
                {showSearchResults && (clientSearchQuery.trim().length >= 2 || clientSearchLoading) ? (
                  <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] shadow-md">
                    {clientSearchLoading ? (
                      <li className="px-3 py-2 text-sm font-body text-[var(--ink-muted)]">Recherche…</li>
                    ) : clientSearchResults.length === 0 ? (
                      <li className="px-3 py-2 text-sm font-body text-[var(--ink-muted)]">Aucun client</li>
                    ) : (
                      clientSearchResults.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm font-body hover:bg-[var(--surface-warm)]"
                            onClick={() => {
                              onSelectExistingClient(row.id)
                              setShowSearchResults(false)
                            }}
                          >
                            <span className="font-medium text-[var(--ink)]">
                              {row.first_name} {row.last_name}
                              {row.company_name ? ` — ${row.company_name}` : ''}
                            </span>
                            <span className="text-xs text-[var(--ink-muted)]">{row.email}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      {pendingConflict && emailConflict ? (
        <div
          ref={conflictRef}
          className={`rounded-[var(--radius-md)] border p-4 transition ring-offset-2 ${
            highlightConflict
              ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]'
              : 'border-[var(--amber)]/50'
          } bg-[var(--amber-soft)]`}
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-body text-[var(--ink)]">
            Ce client existe déjà :{' '}
            <strong>{formatExistingClientLabel(emailConflict)}</strong>.
          </p>
          {mergeChanges.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs font-body text-[var(--ink-soft)]">
              {mergeChanges.slice(0, 8).map((change) => (
                <li key={change.field}>
                  {change.label} : {change.from ?? '—'} → {change.to}
                </li>
              ))}
              {mergeChanges.length > 8 ? (
                <li>+ {mergeChanges.length - 8} autre(s) champ(s)</li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-2 text-xs font-body text-[var(--ink-soft)]">
              Aucun changement détecté par rapport à la fiche existante.
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button id={attachBtnId} type="button" onClick={onConflictAttach}>
              Rattacher à ce client
            </Button>
            <Button type="button" variant="secondary" onClick={onConflictUpdate}>
              Mettre à jour sa fiche avec les nouvelles infos
            </Button>
            <Button type="button" variant="secondary" onClick={onConflictCancel}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {conflictDecision ? (
        <div
          className="rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-3"
          role="status"
          aria-live="polite"
        >
          {conflictDecision.resolution === 'attach' ? (
            <p className="text-sm font-body text-[var(--ink)]">
              Projet rattaché à <strong>{decisionName}</strong> — sa fiche ne sera pas modifiée.{' '}
              <button
                type="button"
                onClick={onConflictChangeDecision}
                className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Changer
              </button>
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-body text-[var(--ink)]">
                La fiche de <strong>{decisionName}</strong> sera mise à jour (
                {conflictDecision.changes.length} champ
                {conflictDecision.changes.length > 1 ? 's' : ''}).{' '}
                <button
                  type="button"
                  onClick={() => setShowDecisionChanges((v) => !v)}
                  className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  {showDecisionChanges ? 'Masquer les changements' : 'Voir les changements'}
                </button>
                {' · '}
                <button
                  type="button"
                  onClick={onConflictChangeDecision}
                  className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  Changer
                </button>
              </p>
              {showDecisionChanges && conflictDecision.changes.length > 0 ? (
                <ul className="list-inside list-disc text-xs font-body text-[var(--ink-soft)]">
                  {conflictDecision.changes.map((change) => (
                    <li key={change.field}>
                      {change.label} : {change.from ?? '—'} → {change.to}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {showClientForm ? (
        <>
          {clientMode === 'existing' && readOnly ? (
            <div className="min-w-0 space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-base font-semibold text-[var(--ink)]">Fiche client</h3>
                <button
                  type="button"
                  onClick={onEditExistingClient}
                  className="text-sm font-body font-medium text-[var(--accent)] hover:underline"
                >
                  Modifier
                </button>
              </div>
              <dl className="space-y-2">
                <SummaryRow label="Nom" value={`${firstName} ${lastName}`.trim()} />
                <SummaryRow label="Email" value={clientEmail} />
                <SummaryRow label="Téléphone" value={phone} />
                {isCompany ? (
                  <>
                    <SummaryRow label="Entreprise" value={companyName} />
                    <SummaryRow label="Forme juridique" value={companyType} />
                    <SummaryRow label="SIRET" value={siret} />
                    <SummaryRow label="TVA" value={vatNumber} />
                  </>
                ) : null}
                {(addressStreet || city || postalCode) ? (
                  <SummaryRow
                    label="Adresse"
                    value={[addressStreet, [postalCode, city].filter(Boolean).join(' '), country]
                      .filter(Boolean)
                      .join(', ')}
                  />
                ) : null}
              </dl>
            </div>
          ) : (
            <>
              {clientMode === 'existing' && !readOnly ? (
                <p className="rounded-[var(--radius-sm)] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-xs font-body text-[var(--ink)]">
                  Les modifications seront enregistrées sur la fiche client.
                </p>
              ) : null}

              <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
                <h3 className="font-display text-base font-semibold text-[var(--ink)]">Informations personnelles</h3>
                <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                  <div>
                    <Input
                      data-field="firstName"
                      placeholder="Prénom *"
                      value={firstName}
                      disabled={disabled}
                      className={disabled ? readonlyInputCls : ''}
                      invalid={Boolean(fieldErrors.firstName)}
                      aria-describedby={fieldErrors.firstName ? `${baseId}-firstName` : undefined}
                      onChange={(e) => onFirstNameChange(e.target.value)}
                    />
                    <FieldError id={`${baseId}-firstName`} message={fieldErrors.firstName} />
                  </div>
                  <div>
                    <Input
                      data-field="lastName"
                      placeholder="Nom *"
                      value={lastName}
                      disabled={disabled}
                      className={disabled ? readonlyInputCls : ''}
                      invalid={Boolean(fieldErrors.lastName)}
                      aria-describedby={fieldErrors.lastName ? `${baseId}-lastName` : undefined}
                      onChange={(e) => onLastNameChange(e.target.value)}
                    />
                    <FieldError id={`${baseId}-lastName`} message={fieldErrors.lastName} />
                  </div>
                </div>
                <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                  <div>
                    <Input
                      data-field="email"
                      type="email"
                      placeholder="Email professionnel *"
                      value={clientEmail}
                      disabled={disabled || clientMode === 'existing'}
                      className={disabled || clientMode === 'existing' ? readonlyInputCls : ''}
                      invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? `${baseId}-email` : undefined}
                      onChange={(e) => onClientEmailChange(e.target.value)}
                      onBlur={onClientEmailBlur}
                    />
                    <FieldError id={`${baseId}-email`} message={fieldErrors.email} />
                    {emailLookupLoading ? (
                      <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">Vérification de l’email…</p>
                    ) : null}
                  </div>
                  <div>
                    <Input
                      data-field="phone"
                      type="tel"
                      placeholder="+33 6 00 00 00 00"
                      value={phone}
                      disabled={disabled}
                      className={disabled ? readonlyInputCls : ''}
                      invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? `${baseId}-phone` : undefined}
                      onChange={(e) => onPhoneChange(e.target.value)}
                    />
                    <FieldError id={`${baseId}-phone`} message={fieldErrors.phone} />
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isCompany}
                    disabled={disabled}
                    onChange={(e) => onIsCompanyChange(e.target.checked)}
                    className="h-4 w-4 shrink-0 rounded accent-[var(--accent)]"
                  />
                  <span className="font-display text-base font-semibold text-[var(--ink)]">
                    Mon client est une entreprise
                  </span>
                </label>
                {isCompany && (
                  <div className="mt-4 min-w-0 space-y-3">
                    {!disabled ? (
                      <CompanySearchAutocomplete
                        label="Rechercher l'entreprise du client"
                        placeholder="Nom de l'entreprise ou SIRET/SIREN du client"
                        onSelect={onCompanySelect}
                      />
                    ) : null}
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="Nom de l'entreprise"
                        value={companyName}
                        disabled={disabled}
                        className={disabled ? readonlyInputCls : ''}
                        onChange={(e) => {
                          onCompanyNameChange(e.target.value)
                          onLegalManualEdit()
                        }}
                      />
                      <select
                        className={`${selectCls} ${disabled ? readonlyInputCls : ''}`}
                        value={companyType}
                        disabled={disabled}
                        onChange={(e) => {
                          onCompanyTypeChange(e.target.value)
                          onLegalManualEdit()
                        }}
                      >
                        <option value="">Type d&apos;entreprise</option>
                        {COMPANY_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="SIRET (14 chiffres)"
                        value={siret}
                        disabled={disabled}
                        className={disabled ? readonlyInputCls : ''}
                        onChange={(e) => {
                          onSiretChange(e.target.value)
                          onLegalManualEdit()
                        }}
                        maxLength={14}
                      />
                      <Input
                        placeholder="N° TVA (FR + 11 chiffres)"
                        value={vatNumber}
                        disabled={disabled}
                        className={disabled ? readonlyInputCls : ''}
                        onChange={(e) => {
                          onVatNumberChange(e.target.value)
                          onLegalManualEdit()
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onShowExtraToggle}
                className="inline-flex min-h-11 items-center text-sm font-body font-medium text-[var(--accent)] hover:underline"
              >
                {showExtra ? '− Masquer les infos complémentaires' : '+ Ajouter plus d’infos'}
              </button>

              {showExtra && (
                <>
                  <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
                    <h3 className="font-display text-base font-semibold text-[var(--ink)]">Adresse</h3>
                    <div className="mt-3 min-w-0 space-y-3">
                      <Input
                        placeholder="Rue"
                        value={addressStreet}
                        disabled={disabled}
                        className={disabled ? readonlyInputCls : ''}
                        onChange={(e) => {
                          onAddressStreetChange(e.target.value)
                          onLegalManualEdit()
                        }}
                      />
                      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                        <Input
                          placeholder="Code postal"
                          value={postalCode}
                          disabled={disabled}
                          className={disabled ? readonlyInputCls : ''}
                          onChange={(e) => {
                            onPostalCodeChange(e.target.value)
                            onLegalManualEdit()
                          }}
                          maxLength={5}
                        />
                        <Input
                          placeholder="Ville"
                          value={city}
                          disabled={disabled}
                          className={disabled ? readonlyInputCls : ''}
                          onChange={(e) => {
                            onCityChange(e.target.value)
                            onLegalManualEdit()
                          }}
                        />
                        <Input
                          placeholder="Pays"
                          value={country}
                          disabled={disabled}
                          className={disabled ? readonlyInputCls : ''}
                          onChange={(e) => onCountryChange(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
                    <h3 className="font-display text-base font-semibold text-[var(--ink)]">
                      Informations complémentaires
                    </h3>
                    <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="https://..."
                        value={website}
                        disabled={disabled}
                        className={disabled ? readonlyInputCls : ''}
                        onChange={(e) => onWebsiteChange(e.target.value)}
                      />
                      <select
                        className={`${selectCls} ${disabled ? readonlyInputCls : ''}`}
                        value={industry}
                        disabled={disabled}
                        onChange={(e) => onIndustryChange(e.target.value)}
                      >
                        <option value="">Secteur d&apos;activité</option>
                        {INDUSTRIES.map((i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-3">
                      <p className="mb-2 text-sm font-body text-[var(--ink-soft)]">Taille de l&apos;entreprise</p>
                      <div className="flex flex-wrap gap-2">
                        {COMPANY_SIZES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={disabled}
                            onClick={() => onCompanySizeChange(s)}
                            className={`min-h-11 rounded-full border px-3 py-2 text-xs font-body transition ${
                              companySize === s
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                                : 'border-[var(--border)] text-[var(--ink-muted)]'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      placeholder="Informations importantes sur ce client..."
                      value={notes}
                      disabled={disabled}
                      onChange={(e) => onNotesChange(e.target.value)}
                      className={`mt-3 w-full rounded-[var(--radius-sm)] border px-4 py-3 text-sm font-body placeholder-[var(--ink-muted)] focus:outline-none ${
                        disabled
                          ? readonlyInputCls
                          : 'border-[var(--border)] bg-[var(--white)] text-[var(--ink)] focus:border-[var(--accent)]'
                      }`}
                      rows={3}
                    />
                  </div>
                </>
              )}
            </>
          )}

          <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
            <h3 className="font-display text-base font-semibold text-[var(--ink)]">Nom du projet *</h3>
            <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
              Prérempli automatiquement ; tu peux le modifier.
            </p>
            <div className="mt-3">
              <Input
                data-field="projectName"
                placeholder="Ex. Site web — AJSOLAIRE"
                value={projectName}
                invalid={Boolean(fieldErrors.projectName)}
                aria-describedby={fieldErrors.projectName ? `${baseId}-projectName` : undefined}
                onChange={(e) => onProjectNameChange(e.target.value)}
              />
              <FieldError id={`${baseId}-projectName`} message={fieldErrors.projectName} />
            </div>
          </div>
        </>
      ) : null}

      {error ? <p className="break-words text-sm font-body text-[var(--amber)]">{error}</p> : null}
      {conflictHint ? (
        <p className="text-sm font-body text-[var(--amber)]" role="alert">
          {conflictHint}
        </p>
      ) : null}
      <Button type="submit" className="w-full">
        Suivant →
      </Button>
    </form>
  )
}
