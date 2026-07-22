/** Profil légal agence — partagé entre rendu PDF et prompts IA. */

export type AgencyLegalProfile = {
  name: string
  legal_form?: string | null
  address_street?: string | null
  address_postal_code?: string | null
  address_city?: string | null
  siret?: string | null
  share_capital?: string | null
  vat_number?: string | null
  rcs_city?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  brand_color?: string | null
  logo_url?: string | null
}

export type ClientProfile = {
  name: string
  company_name?: string | null
  email?: string | null
  address?: string | null
  siret?: string | null
}

export function formatAgencyAddress(profile: AgencyLegalProfile): string | null {
  const line = [profile.address_street, profile.address_postal_code, profile.address_city]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(', ')
  return line || null
}

export function agencyLegalLines(profile: AgencyLegalProfile): string[] {
  const lines: string[] = [profile.name.trim()]
  const form = profile.legal_form?.trim()
  if (form) lines.push(form)
  const address = formatAgencyAddress(profile)
  if (address) lines.push(address)
  if (profile.contact_phone?.trim()) lines.push(`Tel. ${profile.contact_phone.trim()}`)
  if (profile.contact_email?.trim()) lines.push(profile.contact_email.trim())
  if (profile.siret?.trim()) lines.push(`SIRET ${profile.siret.trim()}`)
  if (profile.rcs_city?.trim()) lines.push(`RCS ${profile.rcs_city.trim()}`)
  if (profile.share_capital?.trim()) lines.push(`Capital social : ${profile.share_capital.trim()}`)
  if (profile.vat_number?.trim()) lines.push(`TVA ${profile.vat_number.trim()}`)
  return lines
}

export function clientProfileLines(client: ClientProfile): string[] {
  const lines: string[] = []
  const display = client.company_name?.trim() || client.name.trim()
  if (display) lines.push(display)
  if (client.company_name?.trim() && client.name.trim()) lines.push(`Contact : ${client.name.trim()}`)
  if (client.address?.trim()) lines.push(client.address.trim())
  if (client.email?.trim()) lines.push(client.email.trim())
  if (client.siret?.trim()) lines.push(`SIRET ${client.siret.trim()}`)
  if (lines.length === 0) lines.push(client.name.trim() || 'Client')
  return lines
}

export function agencyLegalContextBlock(profile: AgencyLegalProfile): string {
  const lines = agencyLegalLines(profile)
  if (lines.length <= 1) {
    return 'Profil légal prestataire : incomplet — laisser [à compléter] uniquement pour les champs réellement absents.'
  }
  return `Profil légal du prestataire (recopier tel quel, une information par ligne) :\n${lines.map((l) => `- ${l}`).join('\n')}`
}

/** Normalise le texte IA avant rendu PDF / HTML. */
export function normalizeDocumentText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\[à compléter\s*:\s*[^\]]+\]/gi, '')
    .replace(/\[à compléter\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

export function applyAgencyLegalPlaceholders(
  text: string,
  profile: AgencyLegalProfile,
  client?: ClientProfile | null,
): string {
  const address = formatAgencyAddress(profile)
  let out = normalizeDocumentText(text)

  const replacements: Array<[RegExp, string]> = [
    [/\[Adresse de l'agence à compléter\]/gi, address ?? ''],
    [/\[Adresse à compléter\]/gi, address ?? ''],
    [/\[à compléter\s*:\s*Adresse\]/gi, address ?? ''],
    [/\[à compléter\s*:\s*Téléphone\]/gi, profile.contact_phone?.trim() ?? ''],
    [/\[à compléter\s*:\s*Telephone\]/gi, profile.contact_phone?.trim() ?? ''],
    [/\[à compléter\s*:\s*Email\]/gi, profile.contact_email?.trim() ?? ''],
    [/\[à compléter\s*:\s*E-mail\]/gi, profile.contact_email?.trim() ?? ''],
    [/\[à compléter\s*:\s*SIRET\]/gi, profile.siret?.trim() ?? ''],
    [/\[à compléter\s*:\s*Capital social\]/gi, profile.share_capital?.trim() ?? ''],
    [/\[à compléter\s*:\s*Numéro de référence[^\]]*\]/gi, ''],
    [/\[à compléter[^\]]*\]/gi, ''],
  ]

  for (const [pattern, value] of replacements) {
    out = out.replace(pattern, value)
  }

  if (profile.siret?.trim()) {
    out = out.replace(/SIRET\s*:\s*\[à compléter\]/gi, `SIRET : ${profile.siret.trim()}`)
  }
  if (profile.share_capital?.trim()) {
    out = out.replace(/Capital social\s*:\s*\[à compléter\]/gi, `Capital social : ${profile.share_capital.trim()}`)
  }
  if (profile.vat_number?.trim()) {
    out = out.replace(
      /Numéro de TVA intracommunautaire\s*:\s*\[à compléter\]/gi,
      `TVA intracommunautaire : ${profile.vat_number.trim()}`,
    )
  }

  if (client?.email?.trim()) {
    out = out.replace(/Email\s*:\s*$/gim, `Email : ${client.email.trim()}`)
  }

  return out.replace(/\n{3,}/g, '\n\n').trim()
}

export function normalizeHeading(heading: string): string {
  return heading
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isDeHeading(heading: string): boolean {
  const h = normalizeHeading(heading)
  return h === 'DE' || h.startsWith('DE ') || h === 'EXPEDITEUR' || h === 'PRESTATAIRE'
}

export function isPourHeading(heading: string): boolean {
  const h = normalizeHeading(heading)
  return h === 'POUR' || h.startsWith('POUR ') || h === 'CLIENT' || h === 'DESTINATAIRE'
}

export function isMetaHeading(heading: string): boolean {
  const h = normalizeHeading(heading)
  return h === 'DATE' || h === 'VALIDITE' || h === 'REFERENCE' || h === 'REF' || h === 'REFERENCE DEVIS'
}

export function isLegalFooterHeading(heading: string): boolean {
  const h = normalizeHeading(heading)
  return h.includes('PIED DE PAGE') || h === 'MENTIONS LEGALES'
}

export function parseHexColor(hex: string | null | undefined): { r: number; g: number; b: number } {
  const value = (hex ?? '#5b6ef5').trim()
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value)
  if (!match) return { r: 91 / 255, g: 110 / 255, b: 245 / 255 }
  const n = parseInt(match[1], 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

export function tintRgb(color: { r: number; g: number; b: number }, mix = 0.1) {
  return {
    r: color.r * mix + (1 - mix),
    g: color.g * mix + (1 - mix),
    b: color.b * mix + (1 - mix),
  }
}
