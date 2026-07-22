/**
 * Rendu HTML professionnel pour contrats / propositions générés par IA.
 * Structure calquée sur le template document Frely (letterhead, clauses, signatures).
 */
import {
  applyAgencyLegalPlaceholders,
  formatAgencyAddress,
  parseHexColor,
  normalizeHeading,
  type AgencyLegalProfile,
  type ClientProfile,
} from './agencyLegal.ts'
import {
  buildLayoutCssOverrides,
  escapeHtml,
  extractBulletItems,
  extractHtAmount,
  formatContentAsHtml,
  prepareContractData,
  renderChecklist,
  type ContractDocumentVersion,
  type LayoutProfile,
} from './contractDocument.ts'
import { buildContractStyles } from './contractTemplates/styles.ts'

const DEFAULT_ACCENT = '#2f4b3c'
const DEFAULT_ACCENT_SOFT = '#eef2ee'

export type RenderContractOptions = {
  layoutProfile?: LayoutProfile | null
  /** Bandeau brouillon IA — affiché à l'aperçu, masqué à l'impression / PDF final. */
  showDraftNotice?: boolean
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Adoucit les couleurs de marque trop saturées pour un document imprimable. */
function documentAccentColors(brandColor: string | null | undefined): { accent: string; accentSoft: string } {
  if (!brandColor?.trim()) {
    return { accent: DEFAULT_ACCENT, accentSoft: DEFAULT_ACCENT_SOFT }
  }

  const brand = hexToRgb(brandColor.startsWith('#') ? brandColor : `#${brandColor}`)
  const sober = hexToRgb(DEFAULT_ACCENT)!
  if (!brand) return { accent: DEFAULT_ACCENT, accentSoft: DEFAULT_ACCENT_SOFT }

  const max = Math.max(brand.r, brand.g, brand.b)
  const min = Math.min(brand.r, brand.g, brand.b)
  const saturation = max === 0 ? 0 : (max - min) / max

  const mix = saturation > 0.45 ? 0.72 : saturation > 0.3 ? 0.45 : 0.2
  const accent = rgbToHex(
    brand.r * (1 - mix) + sober.r * mix,
    brand.g * (1 - mix) + sober.g * mix,
    brand.b * (1 - mix) + sober.b * mix,
  )

  const softBase = parseHexColor(accent)
  const accentSoft = rgbToHex(
    softBase.r * 255 * 0.08 + 238,
    softBase.g * 255 * 0.08 + 242,
    softBase.b * 255 * 0.08 + 238,
  )

  return { accent, accentSoft }
}

function siretToSiren(siret: string | null | undefined): string | null {
  const digits = siret?.replace(/\D/g, '') ?? ''
  return digits.length >= 9 ? digits.slice(0, 9) : null
}

function metaValue(
  items: Array<{ label: string; value: string }>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const normalizedKey = normalizeHeading(key)
    const found = items.find((item) => normalizeHeading(item.label).includes(normalizedKey))
    if (found?.value.trim()) return found.value.trim()
  }
  return ''
}

function inferDocumentType(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('contrat') || t.includes('convention') || t.includes('cgu')) return 'Contrat'
  return 'Proposition'
}

function documentEstablishedLabel(documentType: string): string {
  return documentType === 'Contrat' ? 'Contrat établi pour' : 'Proposition établie pour'
}

function documentReferencePhrase(documentType: string): string {
  return documentType === 'Contrat' ? 'du présent contrat' : 'de la présente proposition'
}

function isFinancialSection(heading: string): boolean {
  const h = normalizeHeading(heading)
  return h.includes('RECAPITULATIF') || h.includes('FINANCIER') || h.includes('MONTANT TOTAL')
}

function isTariffSection(heading: string): boolean {
  const h = normalizeHeading(heading)
  return h.includes('TARIF') || h.includes('PRIX') || h.includes('CONDITIONS FINANCIERES')
}

function isLegalClausesSection(heading: string): boolean {
  const h = normalizeHeading(heading)
  return h.includes('CLAUSES') && h.includes('JURIDIQUE')
}

function inferServiceSubject(sections: Array<{ heading: string; content: string }>): string {
  const objet = sections.find((s) => {
    const h = normalizeHeading(s.heading)
    return h.includes('OBJET') || h.includes('PRESTATION')
  })
  if (!objet?.content.trim()) return 'votre projet'

  const firstLine = objet.content.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  const cleaned = firstLine
    .replace(/^la présente proposition a pour objet\s*/i, '')
    .replace(/^objet\s*:\s*/i, '')
    .trim()

  if (cleaned.length > 10) return cleaned.slice(0, 140)
  return objet.heading.replace(/^objet\s*(de la prestation)?\s*:?\s*/i, '').trim() || 'votre projet'
}

function splitTariffBlocks(content: string): { intro: string; inclus: string[]; exclus: string[] } {
  const inclusRe = /(?:^|\n)\s*(?:ce tarif comprend|inclus)\s*:?\s*\n?/i
  const exclusRe = /(?:^|\n)\s*(?:ce tarif ne comprend pas|non compris|hors scope)\s*:?\s*\n?/i

  let intro = content
  let inclus: string[] = []
  let exclus: string[] = []

  const inclusMatch = content.match(inclusRe)
  const exclusMatch = content.match(exclusRe)

  if (inclusMatch?.index !== undefined) {
    intro = content.slice(0, inclusMatch.index).trim()
    const afterInclus = content.slice(inclusMatch.index + inclusMatch[0].length)
    if (exclusMatch?.index !== undefined && exclusMatch.index > inclusMatch.index) {
      const relExclus = exclusMatch.index - (inclusMatch.index + inclusMatch[0].length)
      inclus = extractBulletItems(afterInclus.slice(0, relExclus))
      exclus = extractBulletItems(afterInclus.slice(relExclus + exclusMatch[0].length))
    } else {
      inclus = extractBulletItems(afterInclus)
    }
  } else if (exclusMatch?.index !== undefined) {
    intro = content.slice(0, exclusMatch.index).trim()
    exclus = extractBulletItems(content.slice(exclusMatch.index + exclusMatch[0].length))
  }

  return { intro, inclus, exclus }
}

function renderTariffContent(content: string): string {
  const price = extractHtAmount(content)
  const { intro, inclus, exclus } = splitTariffBlocks(content)
  const parts: string[] = []

  if (price) {
    parts.push(`
      <div class="price-highlight">
        <span class="amount">${escapeHtml(price.amount)} €</span>
        <span class="amount-label">HT<br>(${escapeHtml(price.label)})</span>
      </div>
    `)
  }

  const introText = intro.replace(/(\d[\d\s\u00a0.,]*\s*€\s*HT[^.\n]*)/i, '').trim()
  if (introText) parts.push(formatContentAsHtml(introText))

  if (inclus.length > 0) {
    parts.push('<h3 class="sub-title">Ce tarif comprend</h3>')
    parts.push(renderChecklist(inclus, 'included'))
  }
  if (exclus.length > 0) {
    parts.push('<h3 class="sub-title">Ce tarif ne comprend pas</h3>')
    parts.push(renderChecklist(exclus, 'excluded'))
  }

  return parts.join('\n') || formatContentAsHtml(content)
}

function renderSectionBody(heading: string, content: string): string {
  if (isFinancialSection(heading)) {
    return renderFinancialTable(content) ?? formatContentAsHtml(content)
  }
  if (isTariffSection(heading)) {
    return renderTariffContent(content)
  }
  if (isLegalClausesSection(heading)) {
    return formatContentAsHtml(content)
  }
  return formatContentAsHtml(content)
}

function renderFinancialTable(content: string): string | null {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
  const rows: Array<{ label: string; amount: string; total?: boolean }> = []

  for (const line of lines) {
    const match = line.match(/^(.+?)\s*[:：]\s*(.+)$/)
    if (!match) continue
    const label = match[1].trim()
    const amount = match[2].trim()
    const total = /total|ttc/i.test(label)
    rows.push({ label, amount, total })
  }

  if (rows.length < 2) return null

  const body = rows.map((row) => `
    <tr${row.total ? ' class="total"' : ''}>
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(row.amount)}</td>
    </tr>
  `).join('')

  return `<table class="financial-summary">${body}</table>`
}

function renderClauseSections(
  sections: Array<{ heading: string; content: string }>,
  agency: AgencyLegalProfile,
  client?: ClientProfile | null,
): string {
  return sections.map((section) => {
    const content = applyAgencyLegalPlaceholders(section.content, agency, client)
    if (!content.trim()) return ''

    const bodyHtml = renderSectionBody(section.heading, content)

    return `
      <section class="clause">
        <h2 class="section-title">${escapeHtml(section.heading)}</h2>
        ${bodyHtml}
      </section>
    `
  }).filter(Boolean).join('\n')
}

function renderAgencyMeta(agency: AgencyLegalProfile): string {
  const address = formatAgencyAddress(agency)
  const siren = siretToSiren(agency.siret)
  const parts: string[] = []

  if (address) parts.push(escapeHtml(address))
  const idLine = [
    siren ? `SIREN ${siren}` : agency.siret?.trim() ? `SIRET ${agency.siret.trim()}` : null,
    agency.legal_form?.trim() ?? null,
  ].filter(Boolean).join(' — ')
  if (idLine) parts.push(escapeHtml(idLine))

  const contact = [agency.contact_email?.trim(), agency.contact_phone?.trim()].filter(Boolean).join(' · ')
  if (contact) parts.push(escapeHtml(contact))

  return parts.join('<br>\n        ')
}

function renderClientInfo(client: ClientProfile | null | undefined, pourLines: string[]): string {
  const name = client?.company_name?.trim() || client?.name?.trim() || pourLines[0] || 'Client'
  const lines = [escapeHtml(name)]
  if (client?.email?.trim()) lines.push(escapeHtml(client.email.trim()))
  if (client?.address?.trim()) lines.push(escapeHtml(client.address.trim()))
  if (client?.siret?.trim()) lines.push(`SIRET ${escapeHtml(client.siret.trim())}`)
  return lines.join('<br>\n        ')
}

export function renderContractHtml(
  version: ContractDocumentVersion,
  agency: AgencyLegalProfile,
  client?: ClientProfile | null,
  options?: RenderContractOptions | LayoutProfile | null,
): string {
  const opts: RenderContractOptions = options && 'section_heading_style' in (options as LayoutProfile)
    ? { layoutProfile: options as LayoutProfile }
    : (options as RenderContractOptions) ?? {}

  const data = prepareContractData(version, agency, client)
  const colors = documentAccentColors(agency.brand_color)
  const layoutOverrides = buildLayoutCssOverrides(opts.layoutProfile)
  const styles = buildContractStyles({ ...colors, layoutOverrides })

  const reference = metaValue(data.metaItems, 'Référence', 'Reference', 'REF') || data.defaultRef
  const validity = metaValue(data.metaItems, 'Validité', 'Validite') || '30 jours'
  const documentType = inferDocumentType(data.title)
  const clientName = client?.company_name?.trim() || client?.name?.trim() || data.pourLines[0] || 'le client'
  const serviceSubject = inferServiceSubject(data.bodySections)

  const logoHtml = agency.logo_url?.trim()
    ? `<img class="letterhead-logo" src="${escapeHtml(agency.logo_url.trim())}" alt="" />`
    : ''

  const draftNotice = opts.showDraftNotice
    ? `
  <div class="ai-generated-notice">
    <strong>Brouillon généré automatiquement</strong>
    Ce document a été généré à partir d'un brief et de vos modèles habituels. Relisez chaque clause avant envoi — certaines mentions peuvent nécessiter une validation par un professionnel du droit.
  </div>`
    : ''

  const legalClause = data.showLegalFooter
    ? `
  <section class="clause">
    <h2 class="section-title">Mentions légales</h2>
    ${formatContentAsHtml(data.legalFooterContent)}
  </section>`
    : ''

  const footerParts = [
    agency.name.trim(),
    siretToSiren(agency.siret) ? `SIREN ${siretToSiren(agency.siret)}` : agency.siret?.trim() ? `SIRET ${agency.siret.trim()}` : null,
    formatAgencyAddress(agency),
  ].filter(Boolean).map(escapeHtml)

  const footerContact = agency.contact_email?.trim()
    ? `Pour toute question : ${escapeHtml(agency.contact_email.trim())}`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(documentType)} — ${escapeHtml(reference)}</title>
  <style>${styles}</style>
</head>
<body>
<div class="sheet">

  <header class="letterhead">
    <div class="letterhead-emitter">
      <div class="letterhead-brand">
        ${logoHtml}
        <div>
          <div class="name">${escapeHtml(agency.name)}</div>
          <div class="meta">
        ${renderAgencyMeta(agency)}
          </div>
        </div>
      </div>
    </div>
    <div class="letterhead-doc">
      <div class="doc-label">${escapeHtml(documentType)}</div>
      <div class="doc-ref">Réf. ${escapeHtml(reference)}</div>
      <div class="doc-ref">Émis le ${escapeHtml(data.todayLong)}</div>
    </div>
  </header>

  <h1 class="title">${escapeHtml(data.title)}</h1>
  <p class="subtitle">${escapeHtml(documentEstablishedLabel(documentType))} ${escapeHtml(clientName)}</p>
  <p class="intro-line">Merci pour votre confiance. Voici le détail de notre ${escapeHtml(documentType.toLowerCase())} pour <em>${escapeHtml(serviceSubject)}</em>, pensée pour répondre précisément à vos besoins.</p>
  ${draftNotice}

  <div class="info-grid">
    <div class="info-block">
      <div class="label">Validité de l'offre</div>
      <div class="value">${escapeHtml(validity)} à compter du ${escapeHtml(data.todayLong)}</div>
    </div>
    <div class="info-block">
      <div class="label">Client</div>
      <div class="value">
        ${renderClientInfo(client, data.pourLines)}
      </div>
    </div>
  </div>

  ${renderClauseSections(data.bodySections, agency, client)}
  ${legalClause}

  <div class="signature-zone" id="signature-block">
    <p class="signature-intro">
      Je soussigné, <strong>${escapeHtml(clientName)}</strong>, reconnais avoir pris connaissance ${escapeHtml(documentReferencePhrase(documentType))} et en accepter les termes.
    </p>
    <div class="signature-grid">
      <div class="signature-box">
        <div class="who">Signature du client</div>
        <div class="signature-pad" id="client-signature-zone" data-signature-slot="client">Zone de signature — ${escapeHtml(clientName)}</div>
        <div class="signature-meta">Signé le ____ / ____ / ________</div>
      </div>
      <div class="signature-box">
        <div class="who">Cachet et signature de l'agence</div>
        <div class="signature-pad" data-signature-slot="agence">Zone de signature — ${escapeHtml(agency.name)}</div>
        <div class="signature-meta">Signé le ____ / ____ / ________</div>
      </div>
    </div>
  </div>

  <div class="footer">
    ${footerParts.join(' — ')}<br>
    Document généré via Freli · Référence ${escapeHtml(reference)}${footerContact ? ` · ${footerContact}` : ''}
  </div>

</div>
</body>
</html>`
}
