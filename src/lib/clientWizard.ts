import { isValidContactEmail, normalizeContactPhone } from './contactLinks'

export type ClientWizardMode = 'existing' | 'new'
export type ClientResolution = 'attach' | 'update' | 'create'

export type ClientWizardForm = {
  firstName: string
  lastName: string
  email: string
  phone: string
  isCompany: boolean
  companyName: string
  companyType: string
  siret: string
  vatNumber: string
  siren: string
  codeNaf: string
  legalSource: 'api_gouv' | 'saisie_manuelle' | null
  addressStreet: string
  postalCode: string
  city: string
  country: string
  website: string
  industry: string
  companySize: string
  notes: string
}

export type ClientWizardField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'projectName'

export type ClientWizardFieldErrors = Partial<Record<ClientWizardField, string>>

export type ExistingClientSnapshot = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company_name: string | null
  company_type: string | null
  siret: string | null
  siren: string | null
  code_naf: string | null
  vat_number: string | null
  source_donnees_legales: 'api_gouv' | 'saisie_manuelle' | null
  address_street: string | null
  address_city: string | null
  address_postal_code: string | null
  address_country: string | null
  website: string | null
  industry: string | null
  company_size: string | null
  notes: string | null
}

/** Normalized email for lookup / storage (trim + lowercase). */
export function normalizeClientEmail(email: string): string {
  return email.trim().toLowerCase()
}

function trimOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function hasAddressParts(form: ClientWizardForm): boolean {
  return Boolean(
    form.addressStreet.trim() || form.postalCode.trim() || form.city.trim(),
  )
}

/**
 * Full payload for INSERT. Explicit nulls for empty optional fields,
 * including address_country when no address (avoids DEFAULT 'France').
 */
export function buildClientCreatePayload(
  form: ClientWizardForm,
  agencyId: string,
): Record<string, unknown> {
  const email = normalizeClientEmail(form.email)
  const phoneRaw = form.phone.trim()
  const phone = phoneRaw ? normalizeContactPhone(phoneRaw) : null
  const isCompany =
    form.isCompany ||
    Boolean(form.companyName.trim() || form.siret.trim() || form.vatNumber.trim())

  const payload: Record<string, unknown> = {
    agency_id: agencyId,
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    email,
    phone,
    company_name: isCompany ? trimOrNull(form.companyName) : null,
    company_type: isCompany ? trimOrNull(form.companyType) : null,
    siret: isCompany ? trimOrNull(form.siret.replace(/\s/g, '')) : null,
    vat_number: isCompany ? trimOrNull(form.vatNumber) : null,
    siren: isCompany ? trimOrNull(form.siren.replace(/\s/g, '')) : null,
    code_naf: isCompany ? trimOrNull(form.codeNaf) : null,
    source_donnees_legales: isCompany ? form.legalSource : null,
    website: trimOrNull(form.website),
    industry: trimOrNull(form.industry),
    company_size: trimOrNull(form.companySize),
    notes: trimOrNull(form.notes),
  }

  if (hasAddressParts(form)) {
    payload.address_street = trimOrNull(form.addressStreet)
    payload.address_postal_code = trimOrNull(form.postalCode)
    payload.address_city = trimOrNull(form.city)
    payload.address_country = trimOrNull(form.country) || 'France'
  } else {
    payload.address_street = null
    payload.address_postal_code = null
    payload.address_city = null
    payload.address_country = null
  }

  return payload
}

/**
 * Merge patch for UPDATE: only non-empty form fields.
 * Never writes null (so existing phone/address/SIRET are preserved).
 */
export function buildClientMergePatch(form: ClientWizardForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  const firstName = form.firstName.trim()
  if (firstName) patch.first_name = firstName
  const lastName = form.lastName.trim()
  if (lastName) patch.last_name = lastName

  const email = normalizeClientEmail(form.email)
  if (email) patch.email = email

  const phoneRaw = form.phone.trim()
  if (phoneRaw) {
    const phone = normalizeContactPhone(phoneRaw)
    if (phone) patch.phone = phone
  }

  const companyName = trimOrNull(form.companyName)
  if (companyName) patch.company_name = companyName
  const companyType = trimOrNull(form.companyType)
  if (companyType) patch.company_type = companyType
  const siret = trimOrNull(form.siret.replace(/\s/g, ''))
  if (siret) patch.siret = siret
  const vat = trimOrNull(form.vatNumber)
  if (vat) patch.vat_number = vat
  const siren = trimOrNull(form.siren.replace(/\s/g, ''))
  if (siren) patch.siren = siren
  const codeNaf = trimOrNull(form.codeNaf)
  if (codeNaf) patch.code_naf = codeNaf
  if (form.legalSource) patch.source_donnees_legales = form.legalSource

  if (hasAddressParts(form)) {
    const street = trimOrNull(form.addressStreet)
    if (street) patch.address_street = street
    const postal = trimOrNull(form.postalCode)
    if (postal) patch.address_postal_code = postal
    const city = trimOrNull(form.city)
    if (city) patch.address_city = city
    const country = trimOrNull(form.country)
    if (country) patch.address_country = country
  }

  const website = trimOrNull(form.website)
  if (website) patch.website = website
  const industry = trimOrNull(form.industry)
  if (industry) patch.industry = industry
  const companySize = trimOrNull(form.companySize)
  if (companySize) patch.company_size = companySize
  const notes = trimOrNull(form.notes)
  if (notes) patch.notes = notes

  return patch
}

/**
 * Champs affichables dans le résumé de conflit (libellés FR).
 * Exclut les champs techniques / non saisissables (ex. source_donnees_legales).
 * code_naf est inclus : visible sur la fiche client.
 */
export const CLIENT_CHANGE_DISPLAY_FIELDS: Record<string, string> = {
  first_name: 'Prénom',
  last_name: 'Nom',
  email: 'Email',
  phone: 'Téléphone',
  company_name: 'Entreprise',
  company_type: 'Forme juridique',
  siret: 'SIRET',
  vat_number: 'TVA',
  siren: 'SIREN',
  code_naf: 'Code NAF',
  address_street: 'Rue',
  address_postal_code: 'Code postal',
  address_city: 'Ville',
  address_country: 'Pays',
  website: 'Site web',
  industry: 'Secteur',
  company_size: 'Taille',
  notes: 'Notes',
}

export type ClientChangeSummary = {
  field: string
  label: string
  from: string | null
  to: string
}

/** Diff for the conflict banner: fields that would change on merge update. */
export function summarizeClientMergeChanges(
  existing: ExistingClientSnapshot,
  form: ClientWizardForm,
): ClientChangeSummary[] {
  const patch = buildClientMergePatch(form)
  const changes: ClientChangeSummary[] = []

  for (const [key, next] of Object.entries(patch)) {
    const label = CLIENT_CHANGE_DISPLAY_FIELDS[key]
    if (!label) continue
    const prev = (existing as Record<string, unknown>)[key]
    const prevStr = prev == null || prev === '' ? null : String(prev)
    const nextStr = String(next)
    if (prevStr === nextStr) continue
    // Case-insensitive compare for email
    if (key === 'email' && prevStr && prevStr.toLowerCase() === nextStr.toLowerCase()) continue
    changes.push({
      field: key,
      label,
      from: prevStr,
      to: nextStr,
    })
  }

  return changes
}

export function validateWizardClientFields(
  form: ClientWizardForm,
  projectName: string,
): ClientWizardFieldErrors {
  const errors: ClientWizardFieldErrors = {}

  if (!form.firstName.trim()) errors.firstName = 'Le prénom est obligatoire.'
  if (!form.lastName.trim()) errors.lastName = 'Le nom est obligatoire.'

  const email = form.email.trim()
  if (!email) errors.email = 'L’email est obligatoire.'
  else if (!isValidContactEmail(email)) {
    errors.email = 'L’email est invalide (ex. nom@domaine.fr).'
  }

  const phoneRaw = form.phone.trim()
  if (phoneRaw && normalizeContactPhone(phoneRaw) === null) {
    errors.phone = 'Téléphone invalide (format FR ou international E.164).'
  }

  if (!projectName.trim()) {
    errors.projectName = 'Le nom du projet est obligatoire.'
  }

  return errors
}

export function suggestProjectName(opts: {
  companyName?: string
  firstName?: string
  lastName?: string
  templateLabel?: string | null
}): string {
  const company = opts.companyName?.trim()
  const person = `${opts.firstName?.trim() ?? ''} ${opts.lastName?.trim() ?? ''}`.trim()
  const base = company || person || 'Nouveau projet'
  const template = opts.templateLabel?.trim()
  if (template) return `${template} — ${base}`
  return base
}

export class ClientExistsError extends Error {
  readonly clientId: string

  constructor(clientId: string) {
    super('client_exists')
    this.name = 'ClientExistsError'
    this.clientId = clientId
  }
}

/** Parse PostgREST / RPC error for create_project_with_client email conflict. */
export function parseCreateProjectRpcError(error: {
  message?: string
  details?: string | null
  hint?: string | null
  code?: string
}): ClientExistsError | Error {
  const message = error.message ?? ''
  const details = error.details ?? ''
  const hint = error.hint ?? ''
  const blob = `${message}\n${details}\n${hint}`

  const uuidMatch =
    blob.match(/client_exists[:\s]+([0-9a-f-]{36})/i) ||
    details.match(/^([0-9a-f-]{36})$/i)

  if (/client_exists/i.test(blob) && uuidMatch?.[1]) {
    return new ClientExistsError(uuidMatch[1])
  }
  if (message === 'client_exists' && details) {
    const id = details.trim()
    if (/^[0-9a-f-]{36}$/i.test(id)) return new ClientExistsError(id)
  }
  if (/checklist_empty/i.test(blob)) {
    return new Error('Ajoute au moins un item de checklist.')
  }

  return new Error(message || 'Impossible de créer le projet.')
}

export function formatExistingClientLabel(client: {
  first_name: string
  last_name: string
  company_name?: string | null
}): string {
  const name = `${client.first_name} ${client.last_name}`.trim()
  const company = client.company_name?.trim()
  return company ? `${name} (${company})` : `${name} (sans entreprise)`
}
