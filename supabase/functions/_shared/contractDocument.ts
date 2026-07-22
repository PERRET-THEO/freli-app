/**
 * Préparation des données de rendu contrat (HTML / PDF).
 * Logique de routage des sections partagée entre contractHtml et contractPdf.
 */
import {
  agencyLegalLines,
  applyAgencyLegalPlaceholders,
  clientProfileLines,
  isDeHeading,
  isLegalFooterHeading,
  isMetaHeading,
  isPourHeading,
  normalizeDocumentText,
  normalizeHeading,
  type AgencyLegalProfile,
  type ClientProfile,
} from './agencyLegal.ts'

export type ContractSection = { heading: string; content: string }
export type ContractDocumentVersion = { title: string; sections: ContractSection[] }

export type LayoutProfile = {
  section_heading_style?: 'uppercase' | 'titlecase' | 'sentence'
  numbered_sections?: boolean
  compact_spacing?: boolean
  accent_muted?: boolean
}

export type PreparedContractData = {
  title: string
  today: string
  todayLong: string
  defaultRef: string
  metaItems: Array<{ label: string; value: string }>
  bodySections: ContractSection[]
  deLines: string[]
  pourLines: string[]
  showLegalFooter: boolean
  legalFooterContent: string
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function prepareContractData(
  version: ContractDocumentVersion,
  agency: AgencyLegalProfile,
  client?: ClientProfile | null,
): PreparedContractData {
  const metaItems: Array<{ label: string; value: string }> = []
  const bodySections: ContractSection[] = []
  let skipLegalFooter = false

  const today = new Date().toLocaleDateString('fr-FR')
  const todayLong = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const defaultRef = `PROP-${Date.now().toString().slice(-6)}`

  for (const section of version.sections) {
    const h = normalizeHeading(section.heading)
    const normalizedContent = normalizeDocumentText(section.content)
    if (isMetaHeading(section.heading)) {
      const val = applyAgencyLegalPlaceholders(normalizedContent, agency, client).trim() || (
        h === 'DATE' ? today : h === 'VALIDITE' ? '30 jours' : defaultRef
      )
      metaItems.push({ label: section.heading, value: val })
    } else if (isDeHeading(section.heading) || isPourHeading(section.heading) || isLegalFooterHeading(section.heading)) {
      if (isLegalFooterHeading(section.heading)) skipLegalFooter = true
      continue
    } else {
      bodySections.push({ heading: section.heading, content: normalizedContent })
    }
  }

  if (metaItems.length === 0) {
    metaItems.push(
      { label: 'Date', value: today },
      { label: 'Validité', value: '30 jours' },
      { label: 'Référence', value: defaultRef },
    )
  }

  return {
    title: version.title,
    today,
    todayLong,
    defaultRef,
    metaItems: metaItems.slice(0, 3),
    bodySections,
    deLines: agencyLegalLines(agency),
    pourLines: client ? clientProfileLines(client) : ['Client', 'Informations à compléter'],
    showLegalFooter: !skipLegalFooter,
    legalFooterContent: agencyLegalLines(agency).join('\n\n'),
  }
}

/** Convertit le texte brut (paragraphes + listes) en HTML sémantique. */
export function formatContentAsHtml(content: string): string {
  const paragraphs = content.split(/\n\n+/).filter((p) => p.trim())
  const parts: string[] = []

  for (const para of paragraphs) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const allBullets = lines.every((l) => /^[-•]\s/.test(l))
    const allNumbered = lines.every((l) => /^\d+[.)]\s/.test(l))

    if (allBullets && lines.length > 0) {
      const items = lines.map((l) => `<li>${escapeHtml(l.replace(/^[-•]\s*/, ''))}</li>`).join('')
      parts.push(`<ul>${items}</ul>`)
    } else if (allNumbered && lines.length > 0) {
      const items = lines.map((l) => `<li>${escapeHtml(l.replace(/^\d+[.)]\s*/, ''))}</li>`).join('')
      parts.push(`<ol>${items}</ol>`)
    } else if (lines.length > 1 && lines[0].length < 80 && !lines[0].endsWith('.') && !/^[-•\d]/.test(lines[0])) {
      const body = lines.slice(1).join('\n')
      parts.push(`<h3 class="sub-title">${escapeHtml(lines[0])}</h3>${formatContentAsHtml(body)}`)
    } else {
      const text = lines.map((l) => escapeHtml(l.replace(/^[-•]\s*/, ''))).join('<br>')
      parts.push(`<p>${text}</p>`)
    }
  }

  return parts.join('\n') || '<p></p>'
}

/** Extrait les puces d'un bloc texte. */
export function extractBulletItems(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-•]\s/.test(l))
    .map((l) => l.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
}

/** Extrait un montant HT du texte (ex. "8 000 € HT"). */
export function extractHtAmount(content: string): { amount: string; label: string } | null {
  const match = content.match(/(\d[\d\s\u00a0.,]*)\s*€\s*HT/i)
  if (!match) return null
  const amount = match[1].replace(/\s/g, ' ').trim()
  const parenMatch = content.match(/\(([^)]{5,80})\)/)
  const label = parenMatch?.[1]?.trim() ?? 'hors taxes'
  return { amount, label }
}

export function renderChecklist(items: string[], kind: 'included' | 'excluded'): string {
  if (items.length === 0) return ''
  const mark = kind === 'included' ? '✓' : '✕'
  const itemsHtml = items.map((item) =>
    `<li><span class="mark">${mark}</span>${escapeHtml(item)}</li>`
  ).join('')
  return `<ul class="checklist ${kind}">${itemsHtml}</ul>`
}

export function buildLayoutCssOverrides(profile?: LayoutProfile | null): string {
  if (!profile) return ''
  const rules: string[] = []
  if (profile.section_heading_style === 'uppercase') {
    rules.push('h2.section-title { letter-spacing: 0.06em; }')
  }
  if (profile.compact_spacing) {
    rules.push('section.clause { margin-bottom: 18px; }')
    rules.push('section.clause p { margin-bottom: 8px; }')
  }
  if (profile.accent_muted) {
    rules.push(':root { --accent: #4a4f5e; }')
  }
  if (profile.numbered_sections) {
    rules.push('section.clause { counter-increment: section; }')
    rules.push('h2.section-title::before { content: counter(section) ". "; }')
    rules.push('.sheet { counter-reset: section; }')
  }
  return rules.join('\n')
}

export function layoutProfileFromStructureSummary(
  summary: Record<string, unknown> | null | undefined,
): LayoutProfile | null {
  if (!summary?.layout_hints || typeof summary.layout_hints !== 'object') return null
  const hints = summary.layout_hints as Record<string, unknown>
  const typography = (summary.typography ?? {}) as Record<string, unknown>
  return {
    section_heading_style:
      hints.title_style === 'uppercase' ? 'uppercase' :
      hints.title_style === 'numbered' ? undefined : 'titlecase',
    numbered_sections: hints.title_style === 'numbered' || hints.numbered_sections === true,
    compact_spacing: hints.compact_spacing === true || typography.body_density === 'compact',
    accent_muted: typography.accent_muted === true,
  }
}

/** Persiste un profil de mise en page à partir du résumé structuré OCR. */
export function buildLayoutProfileFromSummary(
  summary: Record<string, unknown>,
): LayoutProfile | null {
  return layoutProfileFromStructureSummary(summary)
}

/** Coordonnée Y normalisée (depuis le haut) — zone signature client (colonne gauche). */
export const HTML_SIGNATURE_Y = 0.78
export const HTML_SIGNATURE_X = 0.1
export const HTML_SIGNATURE_WIDTH = 0.35
export const HTML_SIGNATURE_HEIGHT = 0.09
