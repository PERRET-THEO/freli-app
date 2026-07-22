/**
 * Rendu PDF professionnel pour contrats / propositions générés par IA.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'npm:pdf-lib'
import {
  agencyLegalLines,
  applyAgencyLegalPlaceholders,
  parseHexColor,
  tintRgb,
  type AgencyLegalProfile,
  type ClientProfile,
} from './agencyLegal.ts'
import {
  HTML_SIGNATURE_Y,
  prepareContractData,
  type ContractDocumentVersion,
} from './contractDocument.ts'

export type PdfSection = { heading: string; content: string }
export type PdfDocumentVersion = ContractDocumentVersion

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const FOOTER_ZONE = 42
const BOTTOM = MARGIN + FOOTER_ZONE
const SIGNATURE_BLOCK = 110

export function sanitizeForWinAnsi(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u00B7/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    // deno-lint-ignore no-control-regex
    .replace(/[^\x20-\x7E\u00A1-\u00FF\u0152\u0153\u20AC]/g, '')
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      lines.push('')
      continue
    }
    const words = trimmed.split(/\s+/).filter(Boolean)
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate
      } else {
        if (current) lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

async function fetchLogoImage(
  pdf: PDFDocument,
  logoUrl: string | null | undefined,
): Promise<PDFImage | null> {
  if (!logoUrl?.trim()) return null
  try {
    const res = await fetch(logoUrl)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    const type = res.headers.get('content-type') ?? ''
    if (type.includes('png') || logoUrl.toLowerCase().endsWith('.png')) return await pdf.embedPng(bytes)
    if (type.includes('jpeg') || type.includes('jpg') || /\.jpe?g$/i.test(logoUrl)) {
      return await pdf.embedJpg(bytes)
    }
    return null
  } catch {
    return null
  }
}

type LayoutContext = {
  pdf: PDFDocument
  pages: PDFPage[]
  page: PDFPage
  y: number
  fontRegular: PDFFont
  fontBold: PDFFont
  fontTitle: PDFFont
  fontBody: PDFFont
  accent: RGB
  accentSoft: RGB
  ink: RGB
  muted: RGB
  surface: RGB
  border: RGB
}

function newPage(ctx: LayoutContext) {
  ctx.page = ctx.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.pages.push(ctx.page)
  ctx.y = PAGE_HEIGHT - MARGIN
  drawPageHeaderStripe(ctx)
}

function ensureSpace(ctx: LayoutContext, needed: number) {
  if (ctx.y - needed < BOTTOM) newPage(ctx)
}

function drawPageHeaderStripe(ctx: LayoutContext) {
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 4,
    width: PAGE_WIDTH,
    height: 4,
    color: ctx.accent,
  })
}

function drawLines(
  ctx: LayoutContext,
  lines: string[],
  font: PDFFont,
  size: number,
  lineHeight: number,
  color: RGB,
  x = MARGIN,
  maxWidth = CONTENT_WIDTH,
) {
  for (const line of lines) {
    ensureSpace(ctx, lineHeight)
    const wrapped = line ? wrapText(line, font, size, maxWidth) : ['']
    for (const w of wrapped) {
      ensureSpace(ctx, lineHeight)
      if (w) ctx.page.drawText(w, { x, y: ctx.y, size, font, color })
      ctx.y -= lineHeight
    }
  }
}

function drawHeroHeader(
  ctx: LayoutContext,
  agency: AgencyLegalProfile,
  title: string,
  logo: PDFImage | null,
) {
  const heroH = 118
  ensureSpace(ctx, heroH + 24)
  const top = ctx.y

  // Bandeau pleine largeur
  ctx.page.drawRectangle({
    x: 0,
    y: top - heroH,
    width: PAGE_WIDTH,
    height: heroH,
    color: ctx.accentSoft,
  })
  ctx.page.drawRectangle({
    x: 0,
    y: top - heroH,
    width: 7,
    height: heroH,
    color: ctx.accent,
  })

  let textX = MARGIN + 8
  if (logo) {
    const maxH = 48
    const scale = maxH / logo.height
    const w = logo.width * scale
    const logoX = MARGIN + 4
    const logoY = top - heroH + (heroH - maxH) / 2
    ctx.page.drawRectangle({
      x: logoX - 4,
      y: logoY - 4,
      width: w + 8,
      height: maxH + 8,
      color: rgb(1, 1, 1),
      borderColor: ctx.border,
      borderWidth: 0.5,
    })
    ctx.page.drawImage(logo, { x: logoX, y: logoY, width: w, height: maxH })
    textX = logoX + w + 20
  }

  const maxTitleW = PAGE_WIDTH - textX - MARGIN
  ctx.page.drawText(sanitizeForWinAnsi(agency.name.toUpperCase()), {
    x: textX,
    y: top - 30,
    size: 8,
    font: ctx.fontBold,
    color: ctx.accent,
  })
  const titleLines = wrapText(sanitizeForWinAnsi(title), ctx.fontTitle, 20, maxTitleW)
  titleLines.slice(0, 2).forEach((line, i) => {
    ctx.page.drawText(line, {
      x: textX,
      y: top - 54 - i * 24,
      size: 20,
      font: ctx.fontTitle,
      color: ctx.ink,
    })
  })

  const today = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  ctx.page.drawText(sanitizeForWinAnsi(today), {
    x: textX,
    y: top - heroH + 18,
    size: 9,
    font: ctx.fontRegular,
    color: ctx.muted,
  })

  ctx.y = top - heroH - 26
}

function drawMetaBar(ctx: LayoutContext, items: Array<{ label: string; value: string }>) {
  if (items.length === 0) return
  const barH = 54
  ensureSpace(ctx, barH + 14)
  const top = ctx.y
  ctx.page.drawRectangle({
    x: MARGIN,
    y: top - barH,
    width: CONTENT_WIDTH,
    height: barH,
    color: rgb(1, 1, 1),
    borderColor: ctx.border,
    borderWidth: 0.6,
  })
  ctx.page.drawRectangle({
    x: MARGIN,
    y: top - 3,
    width: CONTENT_WIDTH,
    height: 3,
    color: ctx.accent,
  })
  const colW = CONTENT_WIDTH / items.length
  items.forEach((item, i) => {
    const x = MARGIN + colW * i + 16
    if (i > 0) {
      ctx.page.drawLine({
        start: { x: MARGIN + colW * i, y: top - barH + 10 },
        end: { x: MARGIN + colW * i, y: top - 10 },
        thickness: 0.4,
        color: ctx.border,
      })
    }
    ctx.page.drawText(sanitizeForWinAnsi(item.label.toUpperCase()), {
      x,
      y: top - 18,
      size: 7,
      font: ctx.fontBold,
      color: ctx.accent,
    })
    const valLines = wrapText(sanitizeForWinAnsi(item.value), ctx.fontBody, 10, colW - 24)
    valLines.slice(0, 2).forEach((line, li) => {
      ctx.page.drawText(line, {
        x,
        y: top - 33 - li * 13,
        size: 10,
        font: ctx.fontBody,
        color: ctx.ink,
      })
    })
  })
  ctx.y = top - barH - 18
}

function drawPartyCards(
  ctx: LayoutContext,
  deLines: string[],
  pourLines: string[],
) {
  const cardH = Math.max(deLines.length, pourLines.length) * 13 + 36
  const h = Math.min(Math.max(cardH, 88), 160)
  ensureSpace(ctx, h + 14)
  const top = ctx.y
  const gap = 12
  const cardW = (CONTENT_WIDTH - gap) / 2

  const drawCard = (x: number, label: string, lines: string[]) => {
    ctx.page.drawRectangle({
      x,
      y: top - h,
      width: cardW,
      height: h,
      color: rgb(1, 1, 1),
      borderColor: ctx.border,
      borderWidth: 0.7,
    })
    ctx.page.drawRectangle({
      x,
      y: top - 24,
      width: cardW,
      height: 24,
      color: ctx.accent,
    })
    ctx.page.drawText(label, {
      x: x + 14,
      y: top - 16,
      size: 8.5,
      font: ctx.fontBold,
      color: rgb(1, 1, 1),
    })
    lines.slice(0, 7).forEach((line, i) => {
      ctx.page.drawText(sanitizeForWinAnsi(line), {
        x: x + 14,
        y: top - 40 - i * 13.5,
        size: i === 0 ? 10.5 : 9.5,
        font: i === 0 ? ctx.fontBold : ctx.fontBody,
        color: i === 0 ? ctx.ink : ctx.muted,
      })
    })
  }

  drawCard(MARGIN, 'DE', deLines)
  drawCard(MARGIN + cardW + gap, 'POUR', pourLines)
  ctx.y = top - h - 18
}

function drawSection(
  ctx: LayoutContext,
  heading: string,
  content: string,
) {
  const cleanHeading = sanitizeForWinAnsi(heading)
  const cleanContent = sanitizeForWinAnsi(content)

  ensureSpace(ctx, 56)
  ctx.y -= 10

  ctx.page.drawText(cleanHeading, {
    x: MARGIN,
    y: ctx.y,
    size: 11.5,
    font: ctx.fontBold,
    color: ctx.ink,
  })
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 6 },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y - 6 },
    thickness: 0.5,
    color: ctx.border,
  })
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 8,
    width: 48,
    height: 2,
    color: ctx.accent,
  })
  ctx.y -= 24

  const paragraphs = cleanContent.split(/\n\n+/).filter(Boolean)
  for (const para of paragraphs) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      const isBullet = /^[-•]\s/.test(line)
      const text = isBullet ? line.replace(/^[-•]\s*/, '') : line
      const indent = isBullet ? MARGIN + 16 : MARGIN + 2
      const bulletWidth = CONTENT_WIDTH - (indent - MARGIN) - 4
      if (isBullet) {
        ensureSpace(ctx, 15)
        ctx.page.drawCircle({
          x: MARGIN + 6,
          y: ctx.y + 3,
          size: 2.2,
          color: ctx.accent,
        })
        drawLines(ctx, [text], ctx.fontBody, 10.5, 15, ctx.ink, indent, bulletWidth)
      } else {
        drawLines(ctx, [text], ctx.fontBody, 10.5, 15.5, ctx.ink, indent, CONTENT_WIDTH - 4)
      }
    }
    ctx.y -= 6
  }
  ctx.y -= 10
}

function drawSignatureBlock(ctx: LayoutContext, agencyName: string) {
  ensureSpace(ctx, SIGNATURE_BLOCK + 10)
  ctx.y -= 8
  const boxH = 88
  const baseY = ctx.y
  ctx.page.drawRectangle({
    x: MARGIN,
    y: baseY - boxH,
    width: CONTENT_WIDTH,
    height: boxH,
    color: ctx.surface,
    borderColor: ctx.border,
    borderWidth: 0.5,
  })

  const lineY = baseY - 28
  ctx.page.drawLine({
    start: { x: MARGIN + 20, y: lineY },
    end: { x: MARGIN + 220, y: lineY },
    thickness: 0.6,
    color: rgb(0.72, 0.74, 0.78),
  })
  ctx.page.drawLine({
    start: { x: PAGE_WIDTH - MARGIN - 220, y: lineY },
    end: { x: PAGE_WIDTH - MARGIN - 20, y: lineY },
    thickness: 0.6,
    color: rgb(0.72, 0.74, 0.78),
  })
  ctx.page.drawText('Fait le ____ / ____ / ________', {
    x: MARGIN + 20,
    y: lineY - 18,
    size: 9.5,
    font: ctx.fontRegular,
    color: ctx.muted,
  })
  ctx.page.drawText(sanitizeForWinAnsi(agencyName), {
    x: MARGIN + 20,
    y: lineY - 32,
    size: 8.5,
    font: ctx.fontRegular,
    color: ctx.muted,
  })
  ctx.page.drawText('Signature du client', {
    x: PAGE_WIDTH - MARGIN - 220,
    y: lineY - 18,
    size: 9.5,
    font: ctx.fontRegular,
    color: ctx.muted,
  })
  ctx.y = baseY - boxH - 12
}

function drawFooters(ctx: LayoutContext, agency: AgencyLegalProfile) {
  const legal = agencyLegalLines(agency)
  const footerLine = legal.slice(0, 3).join('  |  ')
  ctx.pages.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN + 22 },
      end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + 22 },
      thickness: 0.4,
      color: rgb(0.88, 0.89, 0.92),
    })
    if (footerLine) {
      const short = sanitizeForWinAnsi(footerLine).slice(0, 120)
      p.drawText(short, { x: MARGIN, y: MARGIN + 8, size: 7, font: ctx.fontRegular, color: ctx.muted })
    }
    p.drawText(`${i + 1} / ${ctx.pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 24,
      y: MARGIN + 8,
      size: 7,
      font: ctx.fontRegular,
      color: ctx.muted,
    })
  })
}

export async function renderContractPdf(
  version: PdfDocumentVersion,
  agency: AgencyLegalProfile,
  client?: ClientProfile | null,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fontTitle = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const fontBody = await pdf.embedFont(StandardFonts.TimesRoman)
  const accentRgb = parseHexColor(agency.brand_color)
  const soft = tintRgb(accentRgb, 0.1)

  const ctx: LayoutContext = {
    pdf,
    pages: [],
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
    fontRegular,
    fontBold,
    fontTitle,
    fontBody,
    accent: rgb(accentRgb.r, accentRgb.g, accentRgb.b),
    accentSoft: rgb(soft.r, soft.g, soft.b),
    ink: rgb(0.1, 0.11, 0.15),
    muted: rgb(0.42, 0.44, 0.5),
    surface: rgb(0.975, 0.976, 0.98),
    border: rgb(0.86, 0.87, 0.9),
  }
  ctx.pages.push(ctx.page)

  const data = prepareContractData(version, agency, client)
  const logo = await fetchLogoImage(pdf, agency.logo_url)
  drawHeroHeader(ctx, agency, data.title, logo)

  drawMetaBar(ctx, data.metaItems)
  drawPartyCards(ctx, data.deLines, data.pourLines)

  for (const section of data.bodySections) {
    const content = applyAgencyLegalPlaceholders(section.content, agency, client)
    if (!content.trim()) continue
    drawSection(ctx, section.heading, content)
  }

  if (data.showLegalFooter) {
    ensureSpace(ctx, 60)
    drawSection(ctx, 'Mentions légales', data.legalFooterContent)
  }

  drawSignatureBlock(ctx, agency.name)
  drawFooters(ctx, agency)

  return await pdf.save()
}

export function defaultSignatureY(): number {
  return HTML_SIGNATURE_Y
}

export { PAGE_HEIGHT }
