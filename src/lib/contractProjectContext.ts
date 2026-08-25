import { supabase } from './supabase'
import { formatPriceEur } from './payments'

export type ContractProjectContext = {
  clientName: string
  clientEmail: string | null
  priceLabel: string | null
  agencyName: string | null
  agencyLines: string[]
  clientLines: string[]
  dateLabel: string
  projectEditPath: string
}

type AgencyRow = {
  name?: string | null
  legal_form?: string | null
  address_street?: string | null
  address_postal_code?: string | null
  address_city?: string | null
  siret?: string | null
  contact_email?: string | null
  contact_phone?: string | null
}

type ClientRow = {
  company_name?: string | null
  first_name?: string | null
  last_name?: string | null
  address_street?: string | null
  address_postal_code?: string | null
  address_city?: string | null
  siret?: string | null
}

function agencyLinesFrom(row: AgencyRow | null | undefined): string[] {
  if (!row?.name?.trim()) return []
  const lines: string[] = [row.name.trim()]
  if (row.legal_form?.trim()) lines.push(row.legal_form.trim())
  const address = [row.address_street, row.address_postal_code, row.address_city]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(', ')
  if (address) lines.push(address)
  if (row.contact_phone?.trim()) lines.push(`Tel. ${row.contact_phone.trim()}`)
  if (row.contact_email?.trim()) lines.push(row.contact_email.trim())
  if (row.siret?.trim()) lines.push(`SIRET ${row.siret.trim()}`)
  return lines
}

function clientLinesFrom(
  clientName: string,
  clientEmail: string | null,
  client: ClientRow | null | undefined,
): string[] {
  const lines: string[] = []
  const company = client?.company_name?.trim()
  const person = [client?.first_name, client?.last_name].map((v) => v?.trim()).filter(Boolean).join(' ')
  const display = company || person || clientName
  if (display) lines.push(display)
  if (company && person) lines.push(`Contact : ${person}`)
  const address = [client?.address_street, client?.address_postal_code, client?.address_city]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(', ')
  if (address) lines.push(address)
  if (clientEmail?.trim()) lines.push(`Email : ${clientEmail.trim()}`)
  if (client?.siret?.trim()) lines.push(`SIRET ${client.siret.trim()}`)
  if (lines.length === 0) lines.push(clientName)
  return lines
}

export async function fetchContractProjectContext(
  projectId: string,
): Promise<ContractProjectContext | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, client_name, client_email, price, agencies(name, legal_form, address_street, address_postal_code, address_city, siret, contact_email, contact_phone), clients(company_name, first_name, last_name, address_street, address_postal_code, address_city, siret)',
    )
    .eq('id', projectId)
    .maybeSingle()

  if (error || !data) return null

  const agencyRel = data.agencies as AgencyRow | AgencyRow[] | null
  const agency = Array.isArray(agencyRel) ? agencyRel[0] : agencyRel
  const clientRel = data.clients as ClientRow | ClientRow[] | null
  const client = Array.isArray(clientRel) ? clientRel[0] : clientRel

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return {
    clientName: data.client_name?.trim() || 'Client',
    clientEmail: data.client_email?.trim() || null,
    priceLabel: data.price != null ? formatPriceEur(data.price) : null,
    agencyName: agency?.name?.trim() || null,
    agencyLines: agencyLinesFrom(agency),
    clientLines: clientLinesFrom(data.client_name ?? 'Client', data.client_email, client),
    dateLabel,
    projectEditPath: `/projects/${projectId}`,
  }
}
