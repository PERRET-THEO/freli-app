/**
 * Construction des profils agence/client pour le rendu de contrats.
 */
import type { AgencyLegalProfile, ClientProfile } from './agencyLegal.ts'
import { layoutProfileFromStructureSummary, type LayoutProfile } from './contractDocument.ts'

export type AgencyRow = AgencyLegalProfile & {
  user_id?: string
  name?: string
  logo_url?: string | null
  brand_color?: string | null
  contact_email?: string | null
  contact_phone?: string | null
}

export type ClientRow = {
  company_name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  address_street?: string | null
  address_city?: string | null
  address_postal_code?: string | null
  siret?: string | null
}

export type ProjectRow = {
  client_name?: string | null
  client_email?: string | null
  clients?: ClientRow | ClientRow[] | null
}

export function buildAgencyProfile(agencyRow: AgencyRow | null | undefined): AgencyLegalProfile {
  return {
    name: agencyRow?.name?.trim() || 'Agence',
    legal_form: agencyRow?.legal_form ?? null,
    address_street: agencyRow?.address_street ?? null,
    address_postal_code: agencyRow?.address_postal_code ?? null,
    address_city: agencyRow?.address_city ?? null,
    siret: agencyRow?.siret ?? null,
    share_capital: agencyRow?.share_capital ?? null,
    vat_number: agencyRow?.vat_number ?? null,
    rcs_city: agencyRow?.rcs_city ?? null,
    contact_email: agencyRow?.contact_email ?? null,
    contact_phone: agencyRow?.contact_phone ?? null,
    brand_color: agencyRow?.brand_color ?? null,
    logo_url: agencyRow?.logo_url ?? null,
  }
}

export function buildClientProfile(project: ProjectRow | null): ClientProfile | null {
  if (!project) return null
  const clientRel = project.clients
  const clientRow = Array.isArray(clientRel) ? clientRel[0] : clientRel
  const personName = [clientRow?.first_name, clientRow?.last_name].filter(Boolean).join(' ').trim()
  const name = project.client_name?.trim() || personName || 'Client'
  const address = clientRow
    ? [clientRow.address_street, clientRow.address_postal_code, clientRow.address_city]
      .map((v) => v?.trim())
      .filter(Boolean)
      .join(', ')
    : null

  return {
    name,
    company_name: clientRow?.company_name ?? null,
    email: project.client_email?.trim() || clientRow?.email?.trim() || null,
    address: address || null,
    siret: clientRow?.siret?.trim() ?? null,
  }
}

export function resolveLayoutProfile(
  storedProfile: LayoutProfile | null | undefined,
  structureSummary: Record<string, unknown> | null | undefined,
): LayoutProfile | null {
  if (storedProfile && Object.keys(storedProfile).length > 0) return storedProfile
  return layoutProfileFromStructureSummary(structureSummary)
}
