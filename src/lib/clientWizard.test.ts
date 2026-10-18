import { describe, expect, it } from 'vitest'
import {
  buildClientCreatePayload,
  buildClientMergePatch,
  ClientExistsError,
  parseCreateProjectRpcError,
  summarizeClientMergeChanges,
  validateWizardClientFields,
  type ClientWizardForm,
  type ExistingClientSnapshot,
} from './clientWizard'

const baseForm = (overrides: Partial<ClientWizardForm> = {}): ClientWizardForm => ({
  firstName: 'Test',
  lastName: 'Claude',
  email: 'client@example.com',
  phone: '',
  isCompany: true,
  companyName: 'AJSOLAIRE',
  companyType: 'SAS',
  siret: '12345678901234',
  vatNumber: 'FR12345678901',
  siren: '123456789',
  codeNaf: '6201Z',
  legalSource: 'api_gouv',
  addressStreet: '1 rue Soleil',
  postalCode: '75001',
  city: 'Paris',
  country: 'France',
  website: '',
  industry: '',
  companySize: '',
  notes: '',
  ...overrides,
})

describe('buildClientMergePatch', () => {
  it('ignores empty fields so existing phone/address/SIRET are never cleared', () => {
    const patch = buildClientMergePatch(
      baseForm({
        phone: '',
        siret: '',
        addressStreet: '',
        postalCode: '',
        city: '',
        companyName: 'AJSOLAIRE Updated',
      }),
    )
    expect(patch.phone).toBeUndefined()
    expect(patch.siret).toBeUndefined()
    expect(patch.address_street).toBeUndefined()
    expect(patch.address_country).toBeUndefined()
    expect(patch.company_name).toBe('AJSOLAIRE Updated')
  })

  it('includes non-empty phone normalized to E.164', () => {
    const patch = buildClientMergePatch(baseForm({ phone: '06 12 34 56 78' }))
    expect(patch.phone).toBe('+33612345678')
  })
})

describe('buildClientCreatePayload', () => {
  it('sets address_country null when no address parts', () => {
    const payload = buildClientCreatePayload(
      baseForm({
        addressStreet: '',
        postalCode: '',
        city: '',
        country: 'France',
      }),
      'agency-1',
    )
    expect(payload.address_street).toBeNull()
    expect(payload.address_postal_code).toBeNull()
    expect(payload.address_city).toBeNull()
    expect(payload.address_country).toBeNull()
  })

  it('writes address including country when street is present', () => {
    const payload = buildClientCreatePayload(baseForm(), 'agency-1')
    expect(payload.address_street).toBe('1 rue Soleil')
    expect(payload.address_country).toBe('France')
  })
})

describe('validateWizardClientFields', () => {
  it('rejects phone "12"', () => {
    const errors = validateWizardClientFields(baseForm({ phone: '12' }), 'Site web — AJSOLAIRE')
    expect(errors.phone).toMatch(/invalide/i)
  })

  it('accepts valid FR phone and project name', () => {
    const errors = validateWizardClientFields(
      baseForm({ phone: '0612345678' }),
      'Site web — AJSOLAIRE',
    )
    expect(errors.phone).toBeUndefined()
    expect(errors.projectName).toBeUndefined()
  })
})

describe('parseCreateProjectRpcError', () => {
  it('maps client_exists with id in message', () => {
    const err = parseCreateProjectRpcError({
      message: 'client_exists:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    })
    expect(err).toBeInstanceOf(ClientExistsError)
    expect((err as ClientExistsError).clientId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })

  it('maps client_exists with id in details', () => {
    const err = parseCreateProjectRpcError({
      message: 'client_exists',
      details: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    })
    expect(err).toBeInstanceOf(ClientExistsError)
    expect((err as ClientExistsError).clientId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })
})

describe('summarizeClientMergeChanges', () => {
  it('lists fields that would change on merge', () => {
    const existing: ExistingClientSnapshot = {
      id: 'c1',
      first_name: 'Old',
      last_name: 'Name',
      email: 'client@example.com',
      phone: '+33600000000',
      company_name: 'OldCo',
      company_type: null,
      siret: null,
      siren: null,
      code_naf: null,
      vat_number: null,
      source_donnees_legales: null,
      address_street: null,
      address_city: null,
      address_postal_code: null,
      address_country: null,
      website: null,
      industry: null,
      company_size: null,
      notes: null,
    }
    const changes = summarizeClientMergeChanges(
      existing,
      baseForm({ firstName: 'Test', companyName: 'AJSOLAIRE', phone: '' }),
    )
    const fields = changes.map((c) => c.field)
    expect(fields).toContain('first_name')
    expect(fields).toContain('company_name')
    expect(fields).not.toContain('phone')
  })

  it('excludes source_donnees_legales but keeps code_naf', () => {
    const existing: ExistingClientSnapshot = {
      id: 'c1',
      first_name: 'Old',
      last_name: 'Name',
      email: 'client@example.com',
      phone: null,
      company_name: 'Co',
      company_type: null,
      siret: null,
      siren: null,
      code_naf: null,
      vat_number: null,
      source_donnees_legales: null,
      address_street: null,
      address_city: null,
      address_postal_code: null,
      address_country: null,
      website: null,
      industry: null,
      company_size: null,
      notes: null,
    }
    const changes = summarizeClientMergeChanges(
      existing,
      baseForm({ codeNaf: '6201Z', legalSource: 'api_gouv' }),
    )
    const fields = changes.map((c) => c.field)
    expect(fields).toContain('code_naf')
    expect(fields).not.toContain('source_donnees_legales')
  })
})
