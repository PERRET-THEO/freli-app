import type { FormEvent } from 'react'
import { Button, Input } from '../ui'
import { CompanySearchAutocomplete } from '../company/CompanySearchAutocomplete'
import type { CompanyLookupResult } from '../../lib/companyLookup'

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

type ClientInfoStepProps = {
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
  error: string | null
  onFirstNameChange: (value: string) => void
  onLastNameChange: (value: string) => void
  onClientEmailChange: (value: string) => void
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
  onCompanySelect: (company: CompanyLookupResult) => void
  onLegalManualEdit: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ClientInfoStep({
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
  error,
  onFirstNameChange,
  onLastNameChange,
  onClientEmailChange,
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
  onCompanySelect,
  onLegalManualEdit,
  onSubmit,
}: ClientInfoStepProps) {
  return (
    <form className="mt-6 min-w-0 space-y-5" onSubmit={onSubmit}>
      <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
        <h3 className="font-display text-base font-semibold text-[var(--ink)]">Informations personnelles</h3>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <Input placeholder="Prénom *" required value={firstName} onChange={(e) => onFirstNameChange(e.target.value)} />
          <Input placeholder="Nom *" required value={lastName} onChange={(e) => onLastNameChange(e.target.value)} />
        </div>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <Input type="email" placeholder="Email professionnel *" required value={clientEmail} onChange={(e) => onClientEmailChange(e.target.value)} />
          <Input type="tel" placeholder="+33 6 00 00 00 00" value={phone} onChange={(e) => onPhoneChange(e.target.value)} />
        </div>
      </div>

      <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={isCompany} onChange={(e) => onIsCompanyChange(e.target.checked)} className="h-4 w-4 shrink-0 rounded accent-[var(--accent)]" />
          <span className="font-display text-base font-semibold text-[var(--ink)]">Mon client est une entreprise</span>
        </label>
        {isCompany && (
          <div className="mt-4 min-w-0 space-y-3">
            <CompanySearchAutocomplete
              label="Rechercher l'entreprise du client"
              placeholder="Nom de l'entreprise ou SIRET/SIREN du client"
              onSelect={onCompanySelect}
            />
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Input placeholder="Nom de l'entreprise" value={companyName} onChange={(e) => { onCompanyNameChange(e.target.value); onLegalManualEdit() }} />
              <select className={selectCls} value={companyType} onChange={(e) => { onCompanyTypeChange(e.target.value); onLegalManualEdit() }}>
                <option value="">Type d&apos;entreprise</option>
                {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Input placeholder="SIRET (14 chiffres)" value={siret} onChange={(e) => { onSiretChange(e.target.value); onLegalManualEdit() }} maxLength={14} />
              <Input placeholder="N° TVA (FR + 11 chiffres)" value={vatNumber} onChange={(e) => { onVatNumberChange(e.target.value); onLegalManualEdit() }} />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onShowExtraToggle}
        className="inline-flex min-h-11 items-center text-sm font-body font-medium text-[var(--accent)] hover:underline"
      >
        {showExtra ? '− Masquer les infos complémentaires' : '+ Ajouter plus d\u2019infos'}
      </button>

      {showExtra && (
        <>
          <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
            <h3 className="font-display text-base font-semibold text-[var(--ink)]">Adresse</h3>
            <div className="mt-3 min-w-0 space-y-3">
              <Input placeholder="Rue" value={addressStreet} onChange={(e) => { onAddressStreetChange(e.target.value); onLegalManualEdit() }} />
              <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                <Input placeholder="Code postal" value={postalCode} onChange={(e) => { onPostalCodeChange(e.target.value); onLegalManualEdit() }} maxLength={5} />
                <Input placeholder="Ville" value={city} onChange={(e) => { onCityChange(e.target.value); onLegalManualEdit() }} />
                <Input placeholder="Pays" value={country} onChange={(e) => onCountryChange(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
            <h3 className="font-display text-base font-semibold text-[var(--ink)]">Informations complémentaires</h3>
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
              <Input placeholder="https://..." value={website} onChange={(e) => onWebsiteChange(e.target.value)} />
              <select className={selectCls} value={industry} onChange={(e) => onIndustryChange(e.target.value)}>
                <option value="">Secteur d&apos;activité</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="mt-3">
              <p className="mb-2 text-sm font-body text-[var(--ink-soft)]">Taille de l&apos;entreprise</p>
              <div className="flex flex-wrap gap-2">
                {COMPANY_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onCompanySizeChange(s)}
                    className={`min-h-11 rounded-full border px-3 py-2 text-xs font-body transition ${companySize === s ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--ink-muted)]'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              placeholder="Informations importantes sur ce client..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
              rows={3}
            />
          </div>
        </>
      )}

      {error ? <p className="break-words text-sm font-body text-[var(--amber)]">{error}</p> : null}
      <Button type="submit" className="w-full">Suivant →</Button>
    </form>
  )
}
