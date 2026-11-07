import { degrees, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import {
  buildLegalMentions,
  formatDateFr,
  formatMoney,
  formatQuantity,
  formatVatRate,
  isBusinessParty,
  KIND_LABELS,
  legalFormForDocuments,
  lineTotalHt,
  type PartySnapshot,
  type SalesDocumentKind,
  type SalesTotals,
} from './salesDocuments'

export type SalesPdfLine = {
  description: string
  quantity: number
  unit: string | null
  unit_price_ht: number
  vat_rate: number
  discount_percent: number
}

export type SalesPdfInput = {
  kind: SalesDocumentKind
  number: string | null
  isDraft: boolean
  title: string | null
  issueDate: string | null
  validUntil: string | null
  dueDate: string | null
  serviceDate: string | null
  notes: string | null
  paymentTerms: string | null
  vatExempt: boolean
  vatExemptionReason: string | null
  issuer: PartySnapshot
  client: PartySnapshot | null
  lines: SalesPdfLine[]
  totals: SalesTotals
  sourceNumber: string | null
  /** Paramètres figés (instantané) ou courants pour un brouillon. */
  iban: string | null
  bic: string | null
  paymentInstructions: string | null
  latePenaltyRate: string | null
  footerNote: string | null
  brandColor: string | null
  /** URL du logo de l'agence (instantané ou fiche agence). */
  logoUrl?: string | null
  /** Logo déjà converti en PNG (ou JPEG) — voir loadLogoForPdf. */
  logoPng?: Uint8Array | null
}

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 44
const INK = rgb(0.05, 0.06, 0.08)
const MUTED = rgb(0.35, 0.37, 0.43)
const BORDER = rgb(0.87, 0.86, 0.83)

function parseHexColor(hex: string | null | undefined): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? '')
  if (!m) return rgb(0.357, 0.431, 0.961) // --accent
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/**
 * Les polices standard PDF n'encodent que WinAnsi : on normalise les espaces
 * insécables (Intl fr-FR) et on remplace les caractères non encodables.
 */
export function sanitizePdfText(font: PDFFont, text: string): string {
  const normalized = text
    .replace(/[\u00a0\u202f\u2007\u2009]/g, ' ')
    .replace(/[‐-‒]/g, '-')
    .replace(/\t/g, '    ')
  let out = ''
  for (const ch of normalized) {
    if (ch === '\n' || ch === '\r') {
      out += ch
      continue
    }
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += '?'
    }
  }
  return out
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const result: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/ +/)
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate
        continue
      }
      if (current) result.push(current)
      // Mot plus long que la largeur : coupe caractère par caractère.
      let chunk = ''
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
          result.push(chunk)
          chunk = ch
        } else {
          chunk += ch
        }
      }
      current = chunk
    }
    result.push(current)
  }
  return result
}

function joinParts(parts: Array<string | null | undefined>, sep = ' '): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(sep)
}

function partyLines(party: PartySnapshot | null, kind: 'issuer' | 'client'): string[] {
  if (!party) return ['Client supprimé']
  const lines: string[] = []
  if (kind === 'issuer') {
    const form = legalFormForDocuments(party.legal_form)
    lines.push(joinParts([party.name, form ? `(${form})` : null]))
  } else {
    const person = joinParts([party.first_name, party.last_name])
    if (party.company_name?.trim()) {
      lines.push(party.company_name.trim())
      if (person) lines.push(`À l'attention de ${person}`)
    } else if (person) {
      lines.push(person)
    }
  }
  if (party.address_street) lines.push(party.address_street)
  const city = joinParts([party.address_postal_code, party.address_city])
  if (city) lines.push(city)
  if (kind === 'client' && party.address_country && !/^france$/i.test(party.address_country)) {
    lines.push(party.address_country)
  }
  if (party.siret) lines.push(`SIRET : ${party.siret}`)
  else if (party.siren) lines.push(`SIREN : ${party.siren}`)
  if (party.vat_number) lines.push(`TVA intracom. : ${party.vat_number}`)
  if (party.contact_email || party.email) lines.push(String(party.contact_email ?? party.email))
  if (party.contact_phone || party.phone) lines.push(String(party.contact_phone ?? party.phone))
  return lines.filter(Boolean)
}

function issuerLegalFooter(issuer: PartySnapshot): string {
  return joinParts(
    [
      issuer.name,
      legalFormForDocuments(issuer.legal_form),
      issuer.share_capital ? `au capital de ${issuer.share_capital}` : null,
      issuer.rcs_city ? `RCS ${issuer.rcs_city}` : null,
      issuer.siret ? `SIRET ${issuer.siret}` : null,
      issuer.vat_number ? `TVA ${issuer.vat_number}` : null,
    ],
    ' · ',
  )
}

type Ctx = {
  doc: PDFDocument
  page: PDFPage
  y: number
  font: PDFFont
  bold: PDFFont
  accent: RGB
  tint: RGB
  input: SalesPdfInput
}

const PAGE_W = A4[0]
const CONTENT_W = PAGE_W - MARGIN * 2
const RIGHT = PAGE_W - MARGIN
const FOOTER_SPACE = 32
const WHITE = rgb(1, 1, 1)
const LINE = rgb(0.9, 0.9, 0.92)
const FAINT = rgb(0.55, 0.57, 0.62)

/** Colonnes du tableau (bords droits pour les montants). */
const COLS = {
  desc: MARGIN + 10,
  qty: MARGIN + 296,
  price: MARGIN + 378,
  vat: MARGIN + 424,
  total: RIGHT - 10,
}

function mix(color: RGB, ratio: number): RGB {
  // ratio = part de la couleur (0..1), le reste en blanc
  return rgb(
    color.red * ratio + (1 - ratio),
    color.green * ratio + (1 - ratio),
    color.blue * ratio + (1 - ratio),
  )
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center' } = {},
) {
  const font = opts.bold ? ctx.bold : ctx.font
  const size = opts.size ?? 9
  const clean = sanitizePdfText(font, value)
  const width = font.widthOfTextAtSize(clean, size)
  const dx = opts.align === 'right' ? width : opts.align === 'center' ? width / 2 : 0
  ctx.page.drawText(clean, { x: x - dx, y, size, font, color: opts.color ?? INK })
}

function width(ctx: Ctx, value: string, size: number, bold = false): number {
  const font = bold ? ctx.bold : ctx.font
  return font.widthOfTextAtSize(sanitizePdfText(font, value), size)
}

/** Rectangle à coins arrondis (y = bord bas). */
function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  opts: { color?: RGB; borderColor?: RGB; borderWidth?: number },
) {
  const rr = Math.min(r, w / 2, h / 2)
  const path = [
    `M ${rr} 0`,
    `H ${w - rr}`,
    `Q ${w} 0 ${w} ${rr}`,
    `V ${h - rr}`,
    `Q ${w} ${h} ${w - rr} ${h}`,
    `H ${rr}`,
    `Q 0 ${h} 0 ${h - rr}`,
    `V ${rr}`,
    `Q 0 0 ${rr} 0`,
    'Z',
  ].join(' ')
  ctx.page.drawSvgPath(path, {
    x,
    y: y + h,
    color: opts.color,
    borderColor: opts.borderColor,
    borderWidth: opts.borderWidth,
  })
}

function hline(ctx: Ctx, y: number, color: RGB = LINE, thickness = 0.6, x1 = MARGIN, x2 = RIGHT) {
  ctx.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color })
}

function label(ctx: Ctx, value: string, x: number, y: number, opts: { color?: RGB; align?: 'left' | 'right' } = {}) {
  text(ctx, value.toUpperCase(), x, y, { size: 6.8, bold: true, color: opts.color ?? FAINT, align: opts.align })
}

function drawWatermark(ctx: Ctx) {
  if (!ctx.input.isDraft) return
  ctx.page.drawText('BROUILLON', {
    x: 130,
    y: 300,
    size: 90,
    font: ctx.bold,
    color: rgb(0.8, 0.8, 0.82),
    opacity: 0.22,
    rotate: degrees(35),
  })
}

function drawTopBand(ctx: Ctx) {
  ctx.page.drawRectangle({ x: 0, y: A4[1] - 5, width: PAGE_W, height: 5, color: ctx.accent })
}

/** En-tête compact des pages suivantes. */
function drawContinuationHeader(ctx: Ctx) {
  const label0 = KIND_LABELS[ctx.input.kind].title
  const ref = ctx.input.number ?? 'Brouillon'
  text(ctx, ctx.input.issuer.name ?? '', MARGIN, ctx.y - 8, { bold: true, size: 9, color: ctx.accent })
  text(ctx, `${label0} ${ref}`, RIGHT, ctx.y - 8, { size: 8.5, color: MUTED, align: 'right' })
  ctx.y -= 28
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage(A4)
  ctx.y = A4[1] - MARGIN
  drawTopBand(ctx)
  drawWatermark(ctx)
  drawContinuationHeader(ctx)
}

function ensureSpace(ctx: Ctx, needed: number, onNewPage?: () => void) {
  if (ctx.y - needed < MARGIN + FOOTER_SPACE) {
    newPage(ctx)
    onNewPage?.()
  }
}

function drawTableHeader(ctx: Ctx) {
  const h = 24
  roundedRect(ctx, MARGIN, ctx.y - h, CONTENT_W, h, 5, { color: ctx.tint })
  const y = ctx.y - 15
  const c = ctx.accent
  label(ctx, 'Désignation', COLS.desc, y, { color: c })
  label(ctx, 'Qté', COLS.qty, y, { color: c, align: 'right' })
  label(ctx, 'Prix unit. HT', COLS.price, y, { color: c, align: 'right' })
  if (!ctx.input.vatExempt) label(ctx, 'TVA', COLS.vat, y, { color: c, align: 'right' })
  label(ctx, 'Total HT', COLS.total, y, { color: c, align: 'right' })
  ctx.y -= h + 12
}

type Logo = { image: Awaited<ReturnType<PDFDocument['embedPng']>>; w: number; h: number }

async function embedLogo(doc: PDFDocument, bytes: Uint8Array | null | undefined): Promise<Logo | null> {
  if (!bytes || bytes.byteLength < 8) return null
  try {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8
    if (!isPng && !isJpg) return null
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    const maxW = 130
    const maxH = 46
    const scale = Math.min(maxW / image.width, maxH / image.height, 1)
    return { image, w: image.width * scale, h: image.height * scale }
  } catch {
    return null
  }
}

export async function buildSalesDocumentPdf(input: SalesPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const kindLabel = KIND_LABELS[input.kind]
  doc.setTitle(input.number ? `${kindLabel.singular} ${input.number}` : `${kindLabel.singular} (brouillon)`)
  doc.setAuthor(input.issuer.name ?? 'Freli')
  doc.setCreator('Freli')
  doc.setProducer('Freli')
  doc.setLanguage('fr-FR')

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const accent = parseHexColor(input.brandColor)
  const ctx: Ctx = {
    doc,
    page: doc.addPage(A4),
    y: A4[1] - MARGIN,
    font,
    bold,
    accent,
    tint: mix(accent, 0.08),
    input,
  }
  drawTopBand(ctx)
  drawWatermark(ctx)
  const logo = await embedLogo(doc, input.logoPng)

  // ---------------------------------------------------------------- En-tête
  const top = ctx.y
  const issuerLines = partyLines(input.issuer, 'issuer')
  const issuerName = issuerLines[0] || 'Votre entreprise'
  let headerBottom: number
  if (logo) {
    ctx.page.drawImage(logo.image, { x: MARGIN, y: top - logo.h, width: logo.w, height: logo.h })
    headerBottom = top - logo.h
    // Logo plutôt carré (pictogramme) : le nom de l'agence l'accompagne.
    if (logo.w / logo.h < 2) {
      const nameX = MARGIN + logo.w + 12
      const nameLines = wrapText(bold, sanitizePdfText(bold, issuerName), 14, 250)
      const blockH = nameLines.length * 17
      const startY = top - logo.h / 2 + blockH / 2 - 12
      nameLines.forEach((l, i) => text(ctx, l, nameX, startY - i * 17, { bold: true, size: 14, color: INK }))
    }
  } else {
    const nameLines = wrapText(bold, sanitizePdfText(bold, issuerName), 17, 280)
    nameLines.forEach((l, i) => text(ctx, l, MARGIN, top - 15 - i * 20, { bold: true, size: 17, color: accent }))
    headerBottom = top - 15 - (nameLines.length - 1) * 20 - 6
  }

  text(ctx, kindLabel.title, RIGHT, top - 8, { bold: true, size: 8.5, color: accent, align: 'right' })
  const numberText = input.number ?? 'Brouillon — non numéroté'
  const numberSize = input.number ? 19 : 13
  text(ctx, numberText, RIGHT, top - 30, { bold: true, size: numberSize, align: 'right' })
  if (input.isDraft) {
    const pill = 'BROUILLON'
    const pw = width(ctx, pill, 7, true) + 16
    roundedRect(ctx, RIGHT - pw, top - 52, pw, 14, 7, { color: rgb(0.99, 0.94, 0.85) })
    text(ctx, pill, RIGHT - pw / 2, top - 47.5, { bold: true, size: 7, color: rgb(0.62, 0.38, 0.05), align: 'center' })
    headerBottom = Math.min(headerBottom, top - 52)
  } else {
    headerBottom = Math.min(headerBottom, top - 36)
  }
  ctx.y = headerBottom - 18

  // ----------------------------------------------------- Bandeau d'informations
  const meta: Array<[string, string, boolean]> = []
  const issueLabel = input.kind === 'quote' ? 'Date du devis' : 'Date d’émission'
  meta.push([issueLabel, input.isDraft && input.kind !== 'quote' ? 'À la finalisation' : formatDateFr(input.issueDate), false])
  if (input.kind === 'quote' && input.validUntil) meta.push(['Valable jusqu’au', formatDateFr(input.validUntil), false])
  if (input.kind === 'invoice' && input.dueDate) meta.push(['Échéance', formatDateFr(input.dueDate), false])
  if (input.kind === 'invoice' && input.serviceDate) meta.push(['Prestation', input.serviceDate, false])
  if (input.kind === 'invoice' && input.sourceNumber) meta.push(['Réf. devis', input.sourceNumber, false])
  if (input.kind === 'credit_note' && input.sourceNumber) meta.push(['Facture d’origine', input.sourceNumber, false])
  const amountLabel =
    input.kind === 'quote' ? (input.vatExempt ? 'Montant' : 'Montant TTC') : input.kind === 'credit_note' ? 'Montant de l’avoir' : 'Montant dû'
  meta.push([amountLabel, formatMoney(input.totals.totalTtc), true])

  const metaH = 46
  roundedRect(ctx, MARGIN, ctx.y - metaH, CONTENT_W, metaH, 8, { color: rgb(0.972, 0.972, 0.965) })
  const cellW = CONTENT_W / meta.length
  meta.forEach(([k, v, strong], i) => {
    const x = MARGIN + 14 + i * cellW
    label(ctx, k, x, ctx.y - 17)
    const maxW = cellW - 20
    let size = strong ? 12 : 10
    while (size > 7 && width(ctx, v, size, true) > maxW) size -= 0.5
    text(ctx, v, x, ctx.y - 33, { bold: true, size, color: strong ? accent : INK })
    if (i > 0) {
      ctx.page.drawLine({
        start: { x: MARGIN + i * cellW, y: ctx.y - 10 },
        end: { x: MARGIN + i * cellW, y: ctx.y - metaH + 10 },
        thickness: 0.6,
        color: LINE,
      })
    }
  })
  ctx.y -= metaH + 20

  // ---------------------------------------------------------- Émetteur / client
  const colW = (CONTENT_W - 24) / 2
  const clientX = MARGIN + colW + 24
  const clientLines = partyLines(input.client, 'client')
  label(ctx, 'Émetteur', MARGIN, ctx.y)
  label(ctx, input.kind === 'quote' ? 'Destinataire' : input.kind === 'credit_note' ? 'Client' : 'Facturé à', clientX, ctx.y)
  hline(ctx, ctx.y - 6, LINE, 0.6, MARGIN, MARGIN + colW)
  hline(ctx, ctx.y - 6, accent, 1.2, clientX, RIGHT)
  const drawParty = (lines: string[], x: number): number => {
    let y = ctx.y - 22
    lines.forEach((line, i) => {
      const size = i === 0 ? 10.5 : 8.5
      const wrapped = wrapText(i === 0 ? bold : font, sanitizePdfText(i === 0 ? bold : font, line), size, colW)
      for (const w of wrapped) {
        text(ctx, w, x, y, { size, bold: i === 0, color: i === 0 ? INK : MUTED })
        y -= i === 0 ? 14 : 11.5
      }
      if (i === 0) y -= 1
    })
    return y
  }
  const yIssuer = drawParty([issuerName, ...issuerLines.slice(1)], MARGIN)
  const yClient = drawParty(clientLines, clientX)
  ctx.y = Math.min(yIssuer, yClient) - 14

  // ------------------------------------------------------------------- Objet
  if (input.title?.trim()) {
    label(ctx, 'Objet', MARGIN, ctx.y)
    const lines = wrapText(bold, sanitizePdfText(bold, input.title.trim()), 11.5, CONTENT_W)
    lines.forEach((l, i) => text(ctx, l, MARGIN, ctx.y - 16 - i * 15, { size: 11.5, bold: true }))
    ctx.y -= 16 + lines.length * 15 + 8
  }

  // --------------------------------------------------------------- Tableau
  ensureSpace(ctx, 60)
  drawTableHeader(ctx)
  const descWidth = COLS.qty - COLS.desc - 48
  input.lines.forEach((line, index) => {
    const descLines = wrapText(font, sanitizePdfText(font, line.description), 9.5, descWidth)
    const extra = line.discount_percent > 0 ? 1 : 0
    const rowHeight = descLines.length * 12.5 + extra * 11 + 14
    ensureSpace(ctx, rowHeight, () => drawTableHeader(ctx))
    const rowTop = ctx.y
    descLines.forEach((l, i) => text(ctx, l, COLS.desc, rowTop - i * 12.5, { size: 9.5 }))
    if (extra) {
      text(ctx, `Remise ${formatVatRate(line.discount_percent)}`, COLS.desc, rowTop - descLines.length * 12.5, {
        size: 8,
        color: accent,
      })
    }
    const qty = `${formatQuantity(line.quantity)}${line.unit ? ` ${line.unit}` : ''}`
    text(ctx, qty, COLS.qty, rowTop, { size: 9.5, align: 'right', color: MUTED })
    text(ctx, formatMoney(line.unit_price_ht), COLS.price, rowTop, { size: 9.5, align: 'right', color: MUTED })
    if (!input.vatExempt) {
      text(ctx, formatVatRate(line.vat_rate), COLS.vat, rowTop, { size: 9.5, align: 'right', color: MUTED })
    }
    text(ctx, formatMoney(lineTotalHt(line)), COLS.total, rowTop, { size: 9.5, align: 'right', bold: true })
    ctx.y -= rowHeight
    if (index < input.lines.length - 1) hline(ctx, ctx.y + 10, LINE, 0.6, MARGIN + 10, RIGHT - 10)
  })
  if (input.lines.length === 0) {
    text(ctx, 'Aucune ligne.', COLS.desc, ctx.y, { size: 9, color: MUTED })
    ctx.y -= 20
  }
  hline(ctx, ctx.y + 8, BORDER, 0.8)
  ctx.y -= 10

  // ------------------------------------------------- Totaux (+ règlement à gauche)
  const totalsRows: Array<[string, string]> = [['Total HT', formatMoney(input.totals.subtotalHt)]]
  if (input.vatExempt) {
    totalsRows.push(['TVA', 'Non applicable'])
  } else {
    for (const row of input.totals.breakdown) {
      totalsRows.push([`TVA ${formatVatRate(row.rate)} sur ${formatMoney(row.base)}`, formatMoney(row.vat)])
    }
  }
  const ttcLabel =
    input.kind === 'credit_note' ? 'Montant de l’avoir TTC' : input.vatExempt ? 'Total net à payer' : 'Total TTC'

  const totalsW = 232
  const totalsX = RIGHT - totalsW
  const totalsH = totalsRows.length * 17 + 12 + 40

  // Bloc règlement (factures) / conditions (devis) à gauche des totaux
  const sideW = totalsX - MARGIN - 24
  const sideLines: string[] = []
  let sideTitle: string | null = null
  if (input.kind === 'invoice') {
    if (input.iban) sideLines.push(`IBAN  ${input.iban}`)
    if (input.bic) sideLines.push(`BIC  ${input.bic}`)
    if (input.paymentInstructions?.trim()) sideLines.push(...input.paymentInstructions.trim().split(/\r?\n/))
    if (sideLines.length) sideTitle = 'Règlement par virement'
  } else if (input.kind === 'quote' && input.paymentTerms?.trim()) {
    sideTitle = 'Conditions de paiement'
    sideLines.push(input.paymentTerms.trim())
  }
  const sideWrapped = sideLines.flatMap((l) => wrapText(font, sanitizePdfText(font, l), 8.5, sideW - 28))
  const sideH = sideTitle ? 34 + sideWrapped.length * 12 : 0

  ensureSpace(ctx, Math.max(totalsH, sideH) + 10)
  const blockTop = ctx.y

  if (sideTitle) {
    roundedRect(ctx, MARGIN, blockTop - sideH, sideW, sideH, 8, { color: ctx.tint })
    label(ctx, sideTitle, MARGIN + 14, blockTop - 16, { color: accent })
    sideWrapped.forEach((l, i) => text(ctx, l, MARGIN + 14, blockTop - 31 - i * 12, { size: 8.5 }))
  }

  let ty = blockTop - 10
  for (const [k, v] of totalsRows) {
    text(ctx, k, totalsX + 12, ty, { size: 8.8, color: MUTED })
    text(ctx, v, RIGHT - 12, ty, { size: 9.2, align: 'right' })
    ty -= 17
  }
  ty -= 4
  roundedRect(ctx, totalsX, ty - 26, totalsW, 34, 8, { color: accent })
  text(ctx, ttcLabel, totalsX + 12, ty - 13, { bold: true, size: 9.5, color: WHITE })
  text(ctx, formatMoney(input.totals.totalTtc), RIGHT - 12, ty - 14, { bold: true, size: 13, color: WHITE, align: 'right' })
  ty -= 34

  ctx.y = Math.min(ty, blockTop - sideH) - 20

  // ---------------------------------------------------------------- Notes
  const section = (heading: string, body: string, size = 8.5, color: RGB = INK) => {
    const lines = wrapText(font, sanitizePdfText(font, body), size, CONTENT_W)
    ensureSpace(ctx, lines.length * (size + 3.5) + 20)
    label(ctx, heading, MARGIN, ctx.y)
    ctx.y -= 14
    for (const l of lines) {
      text(ctx, l, MARGIN, ctx.y, { size, color })
      ctx.y -= size + 3.5
    }
    ctx.y -= 10
  }

  if (input.notes?.trim()) section('Notes', input.notes.trim(), 9)

  // ------------------------------------------------------- Mentions légales
  const mentions = buildLegalMentions({
    kind: input.kind,
    vatExempt: input.vatExempt,
    vatExemptionReason: input.vatExemptionReason,
    dueDate: input.dueDate,
    validUntil: input.validUntil,
    paymentTerms: input.paymentTerms,
    latePenaltyRate: input.latePenaltyRate,
    clientIsBusiness: isBusinessParty(input.client),
    sourceNumber: input.sourceNumber,
  })
  if (mentions.length) section('Conditions et mentions légales', mentions.join('\n'), 7.6, MUTED)
  if (input.footerNote?.trim()) section('Informations', input.footerNote.trim(), 7.6, MUTED)

  // ------------------------------------------------------- Bon pour accord
  if (input.kind === 'quote') {
    const w = 250
    const x = RIGHT - w
    const h = 64
    ensureSpace(ctx, h)
    roundedRect(ctx, x, ctx.y - h, w, h, 8, { borderColor: BORDER, borderWidth: 0.8, color: WHITE })
    text(ctx, 'Bon pour accord', x + 14, ctx.y - 18, { bold: true, size: 9.5 })
    text(ctx, 'Date, signature et mention « Lu et approuvé »', x + 14, ctx.y - 31, { size: 7.5, color: MUTED })
    const lx = MARGIN
    text(ctx, 'Pour accord, le client', lx, ctx.y - 18, { size: 8, color: MUTED })
    text(ctx, joinParts([input.client?.first_name, input.client?.last_name]) || input.client?.company_name || '', lx, ctx.y - 31, {
      size: 9,
      bold: true,
    })
    ctx.y -= h + 18
  }

  // ------------------------------------------------- Pied de page (chaque page)
  const pages = doc.getPages()
  const legal = issuerLegalFooter(input.issuer)
  const contact = joinParts(
    [input.issuer.contact_email ?? input.issuer.email, input.issuer.contact_phone ?? input.issuer.phone],
    ' · ',
  )
  pages.forEach((page, i) => {
    ctx.page = page
    hline(ctx, MARGIN + 22, LINE, 0.6)
    const footerLines = wrapText(font, sanitizePdfText(font, legal), 7, CONTENT_W - 70)
    footerLines.slice(0, 2).forEach((l, idx) => text(ctx, l, MARGIN, MARGIN + 9 - idx * 9, { size: 7, color: FAINT }))
    if (contact && footerLines.length < 2) text(ctx, contact, MARGIN, MARGIN, { size: 7, color: FAINT })
    text(ctx, `Page ${i + 1}/${pages.length}`, RIGHT, MARGIN + 9, { size: 7, color: FAINT, align: 'right' })
  })

  return doc.save()
}

export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Prépare l'entrée PDF : instantanés figés pour un document finalisé,
 * données courantes (agence, client, paramètres) pour un brouillon.
 */
export function pdfInputFromDocument(input: {
  document: {
    kind: SalesDocumentKind
    status: string
    number: string | null
    title: string | null
    issue_date: string | null
    valid_until: string | null
    due_date: string | null
    service_date: string | null
    notes: string | null
    payment_terms: string | null
    vat_exempt: boolean
    vat_exemption_reason: string | null
    issuer_snapshot: PartySnapshot | null
    client_snapshot: PartySnapshot | null
  }
  lines: SalesPdfLine[]
  totals: SalesTotals
  sourceNumber: string | null
  currentIssuer: PartySnapshot | null
  currentClient: PartySnapshot | null
  settings: {
    iban: string | null
    bic: string | null
    payment_instructions: string | null
    late_penalty_rate: string | null
    footer_note: string | null
  } | null
}): SalesPdfInput {
  const d = input.document
  const isDraft = d.status === 'draft'
  const issuer = (isDraft ? input.currentIssuer : d.issuer_snapshot ?? input.currentIssuer) ?? {}
  const client = isDraft ? input.currentClient : d.client_snapshot ?? input.currentClient
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  return {
    kind: d.kind,
    number: d.number,
    isDraft,
    title: d.title,
    issueDate: d.issue_date,
    validUntil: d.valid_until,
    dueDate: d.due_date,
    serviceDate: d.service_date,
    notes: d.notes,
    paymentTerms: d.payment_terms,
    vatExempt: d.vat_exempt,
    vatExemptionReason: d.vat_exemption_reason,
    issuer,
    client,
    lines: input.lines,
    totals: input.totals,
    sourceNumber: input.sourceNumber,
    iban: isDraft ? input.settings?.iban ?? null : str(issuer.iban),
    bic: isDraft ? input.settings?.bic ?? null : str(issuer.bic),
    paymentInstructions: isDraft
      ? input.settings?.payment_instructions ?? null
      : str(issuer.payment_instructions),
    latePenaltyRate: isDraft
      ? input.settings?.late_penalty_rate ?? null
      : str(issuer.late_penalty_rate),
    footerNote: isDraft ? input.settings?.footer_note ?? null : str(issuer.footer_note),
    brandColor: str(issuer.brand_color),
    logoUrl: str(issuer.logo_url),
  }
}

/**
 * Charge le logo (PNG, JPEG, GIF, WebP, SVG…) et le convertit en PNG via un
 * canvas, car le format PDF n'intègre que le PNG et le JPEG. Navigateur
 * uniquement ; renvoie null en cas d'échec (le PDF affiche alors le nom).
 */
export async function loadLogoForPdf(url: string | null | undefined, timeoutMs = 4000): Promise<Uint8Array | null> {
  if (!url || typeof document === 'undefined' || typeof Image === 'undefined') return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('logo'))
      window.setTimeout(() => reject(new Error('timeout')), timeoutMs)
    })
    img.src = url
    await loaded
    const natW = img.naturalWidth || 300
    const natH = img.naturalHeight || 120
    // Résolution suffisante pour l'impression (≈ 3× la taille affichée).
    const scale = Math.min(1, 600 / Math.max(natW, natH * 2.8))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(natW * scale))
    canvas.height = Math.max(1, Math.round(natH * scale))
    const c2d = canvas.getContext('2d')
    if (!c2d) return null
    c2d.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return null
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null
  }
}
