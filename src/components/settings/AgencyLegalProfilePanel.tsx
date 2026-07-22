import { Button, Input } from '../ui'
import { LEGAL_FORM_OPTIONS } from '../../lib/agencyLegal'
import { CompanySearchAutocomplete } from '../company/CompanySearchAutocomplete'
import type { CompanyLookupResult } from '../../lib/companyLookup'

type AgencyLegalProfilePanelProps = {
  legalForm: string
  addressStreet: string
  addressPostalCode: string
  addressCity: string
  siret: string
  siren: string
  shareCapital: string
  vatNumber: string
  rcsCity: string
  onLegalFormChange: (value: string) => void
  onAddressStreetChange: (value: string) => void
  onAddressPostalCodeChange: (value: string) => void
  onAddressCityChange: (value: string) => void
  onSiretChange: (value: string) => void
  onShareCapitalChange: (value: string) => void
  onVatNumberChange: (value: string) => void
  onRcsCityChange: (value: string) => void
  onCompanySelect: (company: CompanyLookupResult) => void
  onSave: () => void
  saving: boolean
}

export function AgencyLegalProfilePanel({
  legalForm,
  addressStreet,
  addressPostalCode,
  addressCity,
  siret,
  siren,
  shareCapital,
  vatNumber,
  rcsCity,
  onLegalFormChange,
  onAddressStreetChange,
  onAddressPostalCodeChange,
  onAddressCityChange,
  onSiretChange,
  onShareCapitalChange,
  onVatNumberChange,
  onRcsCityChange,
  onCompanySelect,
  onSave,
  saving,
}: AgencyLegalProfilePanelProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-body leading-relaxed text-[var(--ink-muted)]">
        Ces informations complètent automatiquement vos contrats et propositions générés par
        l&apos;IA (blocs DE / POUR, pied de page, mentions légales).
      </p>

      <CompanySearchAutocomplete
        label="Rechercher mon entreprise"
        placeholder="Nom de votre entreprise ou SIRET/SIREN"
        onSelect={onCompanySelect}
        showRefresh
        currentSiren={siren.trim() || null}
      />

      <div>
        <label className="mb-1.5 block text-sm font-body font-medium text-[var(--ink-soft)]">
          Forme juridique
        </label>
        <select
          value={legalForm}
          onChange={(e) => onLegalFormChange(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
        >
          <option value="">— Sélectionner —</option>
          {LEGAL_FORM_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <Input
        placeholder="Adresse (rue, numéro)"
        value={addressStreet}
        onChange={(e) => onAddressStreetChange(e.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Code postal"
          value={addressPostalCode}
          onChange={(e) => onAddressPostalCodeChange(e.target.value)}
        />
        <Input
          placeholder="Ville"
          value={addressCity}
          onChange={(e) => onAddressCityChange(e.target.value)}
        />
      </div>
      <Input
        placeholder="SIRET (14 chiffres)"
        value={siret}
        onChange={(e) => onSiretChange(e.target.value.replace(/\s+/g, ''))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Capital social (ex. 1 000 €)"
          value={shareCapital}
          onChange={(e) => onShareCapitalChange(e.target.value)}
        />
        <Input
          placeholder="N° TVA intracommunautaire"
          value={vatNumber}
          onChange={(e) => onVatNumberChange(e.target.value)}
        />
      </div>
      <Input
        placeholder="Ville du RCS (ex. Paris)"
        value={rcsCity}
        onChange={(e) => onRcsCityChange(e.target.value)}
      />

      <Button onClick={onSave} disabled={saving}>
        {saving ? 'Enregistrement…' : 'Enregistrer les informations légales'}
      </Button>
    </div>
  )
}
