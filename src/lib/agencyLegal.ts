import type { AgencyBranding } from './agencyBranding'

export type AgencyLegalFields = {
  legal_form: string | null
  address_street: string | null
  address_postal_code: string | null
  address_city: string | null
  siret: string | null
  share_capital: string | null
  vat_number: string | null
  rcs_city: string | null
  siren: string | null
  code_naf: string | null
  source_donnees_legales: string | null
}

export type AgencyWithLegal = AgencyBranding & AgencyLegalFields

export const LEGAL_FORM_OPTIONS = [
  'Auto-entrepreneur',
  'EURL',
  'SASU',
  'SARL',
  'SAS',
  'SA',
  'Association',
  'Autre',
] as const
