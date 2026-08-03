import { useState } from 'react'
import type { CompanyLookupResult } from '../../lib/companyLookup'
import {
  defaultMapsHref,
  formatClientAddress,
  formatPhoneDisplay,
  isNavigableAddress,
  mailtoHref,
  telHref,
} from '../../lib/contactLinks'
import type { ClientRecord } from '../../lib/clientRecord'
import type { FieldSaveStatus } from '../../hooks/useClientFieldSave'
import { CompanySearchAutocomplete } from '../company/CompanySearchAutocomplete'
import { Button } from '../ui'
import { ClientPropertyRow } from './ClientPropertyRow'

type ClientPropertyPanelProps = {
  client: ClientRecord
  statuses: Record<string, FieldSaveStatus>
  errors: Record<string, string>
  onSaveField: (field: string, raw: string) => void | Promise<boolean | void>
  onScheduleSaveField: (field: string, raw: string) => void
  onSaveAddress: (raw: {
    address_street: string
    address_city: string
    address_postal_code: string
    address_country: string
  }) => Promise<boolean | void>
  onApplyCompany: (company: CompanyLookupResult) => Promise<boolean | void>
  onCancelField?: (field: string) => void
}

export function ClientPropertyPanel({
  client,
  statuses,
  errors,
  onSaveField,
  onScheduleSaveField,
  onSaveAddress,
  onApplyCompany,
  onCancelField,
}: ClientPropertyPanelProps) {
  const [addressDraft, setAddressDraft] = useState({
    address_street: client.address_street ?? '',
    address_city: client.address_city ?? '',
    address_postal_code: client.address_postal_code ?? '',
    address_country: client.address_country ?? 'France',
  })
  const [addressEditing, setAddressEditing] = useState(false)

  const addressParts = {
    street: client.address_street,
    postal: client.address_postal_code,
    city: client.address_city,
    country: client.address_country,
  }
  const addressDisplay = formatClientAddress(addressParts)
  const navigable = isNavigableAddress(addressParts)
  const phoneDisplay = formatPhoneDisplay(client.phone)

  return (
    <aside className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5 lg:sticky lg:top-4">
      <h2 className="font-display text-base font-semibold text-[var(--ink)]">Propriétés</h2>

      <section className="mt-4">
        <p className="text-[11px] font-body font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Contact
        </p>
        <ClientPropertyRow
          label="Prénom"
          value={client.first_name}
          status={statuses.first_name}
          error={errors.first_name}
          onCommit={(raw) => onSaveField('first_name', raw)}
          onDraftChange={(raw) => onScheduleSaveField('first_name', raw)}
          onCancelEdit={() => onCancelField?.('first_name')}
        />
        <ClientPropertyRow
          label="Nom"
          value={client.last_name}
          status={statuses.last_name}
          error={errors.last_name}
          onCommit={(raw) => onSaveField('last_name', raw)}
          onDraftChange={(raw) => onScheduleSaveField('last_name', raw)}
          onCancelEdit={() => onCancelField?.('last_name')}
        />
        <ClientPropertyRow
          label="Email"
          value={client.email}
          inputType="email"
          displayValue={
            <a
              href={mailtoHref(client.email)}
              onClick={(event) => event.stopPropagation()}
              className="break-all text-[var(--accent)] underline-offset-2 hover:underline"
            >
              {client.email}
            </a>
          }
          status={statuses.email}
          error={errors.email}
          onCommit={(raw) => onSaveField('email', raw)}
          onCancelEdit={() => onCancelField?.('email')}
        />
        <ClientPropertyRow
          label="Téléphone"
          value={client.phone}
          inputType="tel"
          emptyLabel="Ajouter"
          displayValue={
            phoneDisplay ? (
              <a
                href={telHref(client.phone ?? phoneDisplay)}
                onClick={(event) => event.stopPropagation()}
                className="text-[var(--accent)] underline-offset-2 hover:underline"
              >
                {phoneDisplay}
              </a>
            ) : undefined
          }
          status={statuses.phone}
          error={errors.phone}
          onCommit={(raw) => onSaveField('phone', raw)}
          onCancelEdit={() => onCancelField?.('phone')}
        />
      </section>

      <section className="mt-5">
        <p className="text-[11px] font-body font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Entreprise
        </p>
        <div className="mt-2">
          <CompanySearchAutocomplete
            label="Recherche SIRENE"
            onSelect={(company) => {
              void onApplyCompany(company)
            }}
            currentSiren={client.siren}
            showRefresh={Boolean(client.siren)}
          />
        </div>
        <ClientPropertyRow
          label="Raison sociale"
          value={client.company_name}
          emptyLabel="Ajouter"
          status={statuses.company_name}
          error={errors.company_name}
          onCommit={(raw) => onSaveField('company_name', raw)}
          onDraftChange={(raw) => onScheduleSaveField('company_name', raw)}
          onCancelEdit={() => onCancelField?.('company_name')}
        />
        <ClientPropertyRow
          label="Forme"
          value={client.company_type}
          emptyLabel="Ajouter"
          status={statuses.company_type}
          error={errors.company_type}
          onCommit={(raw) => onSaveField('company_type', raw)}
          onCancelEdit={() => onCancelField?.('company_type')}
        />
        <ClientPropertyRow
          label="SIRET"
          value={client.siret}
          emptyLabel="Ajouter"
          status={statuses.siret}
          error={errors.siret}
          onCommit={(raw) => onSaveField('siret', raw)}
          onCancelEdit={() => onCancelField?.('siret')}
        />
        <ClientPropertyRow
          label="SIREN"
          value={client.siren}
          emptyLabel="Ajouter"
          status={statuses.siren}
          error={errors.siren}
          onCommit={(raw) => onSaveField('siren', raw)}
          onCancelEdit={() => onCancelField?.('siren')}
        />
        <ClientPropertyRow
          label="TVA"
          value={client.vat_number}
          emptyLabel="Ajouter"
          status={statuses.vat_number}
          error={errors.vat_number}
          onCommit={(raw) => onSaveField('vat_number', raw)}
          onCancelEdit={() => onCancelField?.('vat_number')}
        />
        <ClientPropertyRow
          label="Code NAF"
          value={client.code_naf}
          emptyLabel="Ajouter"
          status={statuses.code_naf}
          error={errors.code_naf}
          onCommit={(raw) => onSaveField('code_naf', raw)}
          onCancelEdit={() => onCancelField?.('code_naf')}
        />
        <ClientPropertyRow
          label="Site web"
          value={client.website}
          inputType="url"
          emptyLabel="Ajouter"
          displayValue={
            client.website ? (
              <a
                href={
                  /^https?:\/\//i.test(client.website)
                    ? client.website
                    : `https://${client.website}`
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="break-all text-[var(--accent)] underline-offset-2 hover:underline"
              >
                {client.website}
              </a>
            ) : undefined
          }
          status={statuses.website}
          error={errors.website}
          onCommit={(raw) => onSaveField('website', raw)}
          onCancelEdit={() => onCancelField?.('website')}
        />
      </section>

      <section className="mt-5">
        <p className="text-[11px] font-body font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Adresse
        </p>
        {addressEditing ? (
          <div className="mt-2 space-y-2">
            <label className="block text-xs font-body text-[var(--ink-muted)]">
              Rue
              <input
                className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm"
                value={addressDraft.address_street}
                onChange={(e) =>
                  setAddressDraft((prev) => ({ ...prev, address_street: e.target.value }))
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-body text-[var(--ink-muted)]">
                CP
                <input
                  className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm"
                  value={addressDraft.address_postal_code}
                  onChange={(e) =>
                    setAddressDraft((prev) => ({
                      ...prev,
                      address_postal_code: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-xs font-body text-[var(--ink-muted)]">
                Ville
                <input
                  className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm"
                  value={addressDraft.address_city}
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, address_city: e.target.value }))
                  }
                />
              </label>
            </div>
            <label className="block text-xs font-body text-[var(--ink-muted)]">
              Pays
              <input
                className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm"
                value={addressDraft.address_country}
                onChange={(e) =>
                  setAddressDraft((prev) => ({ ...prev, address_country: e.target.value }))
                }
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={async () => {
                  const ok = await onSaveAddress(addressDraft)
                  if (ok !== false) setAddressEditing(false)
                }}
              >
                Enregistrer l’adresse
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setAddressDraft({
                    address_street: client.address_street ?? '',
                    address_city: client.address_city ?? '',
                    address_postal_code: client.address_postal_code ?? '',
                    address_country: client.address_country ?? 'France',
                  })
                  setAddressEditing(false)
                }}
              >
                Annuler
              </Button>
            </div>
            {statuses.address === 'error' ? (
              <p className="text-[11px] font-body text-[#EF4444]">{errors.address}</p>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <button
              type="button"
              onClick={() => {
                setAddressDraft({
                  address_street: client.address_street ?? '',
                  address_city: client.address_city ?? '',
                  address_postal_code: client.address_postal_code ?? '',
                  address_country: client.address_country ?? 'France',
                })
                setAddressEditing(true)
              }}
              className={`min-h-11 w-full rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm font-body hover:bg-[var(--surface-warm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                addressDisplay ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'
              }`}
            >
              {addressDisplay ?? 'Ajouter une adresse'}
            </button>
            {navigable && addressDisplay ? (
              <a
                href={defaultMapsHref(addressDisplay)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-xs font-body font-semibold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Itinéraire
              </a>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-5">
        <p className="text-[11px] font-body font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Notes
        </p>
        <ClientPropertyRow
          label="Notes"
          value={client.notes}
          emptyLabel="Ajouter"
          multiline
          status={statuses.notes}
          error={errors.notes}
          onCommit={(raw) => onSaveField('notes', raw)}
          onDraftChange={(raw) => onScheduleSaveField('notes', raw)}
          onCancelEdit={() => onCancelField?.('notes')}
        />
        <ClientPropertyRow
          label="Créé le"
          value={new Date(client.created_at).toLocaleDateString('fr-FR')}
          readOnly
          onCommit={() => undefined}
        />
      </section>
    </aside>
  )
}
