/**
 * Conversion HTML → PDF via service externe (Browserless par défaut).
 * Repli sur pdf-lib si le service n'est pas configuré ou en cas d'échec.
 */
import type { AgencyLegalProfile, ClientProfile } from './agencyLegal.ts'
import { renderContractHtml } from './contractHtml.ts'
import type { ContractDocumentVersion, LayoutProfile } from './contractDocument.ts'
import { renderContractPdf } from './contractPdf.ts'

export type PdfRenderOptions = {
  format?: 'A4' | 'Letter'
  printBackground?: boolean
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
}

const DEFAULT_MARGINS = {
  top: '18mm',
  right: '18mm',
  bottom: '22mm',
  left: '18mm',
}

function getPdfServiceConfig(): { url: string; apiKey: string } | null {
  const apiKey = Deno.env.get('PDF_SERVICE_API_KEY')?.trim() ?? ''
  if (!apiKey) return null
  const url = (Deno.env.get('PDF_SERVICE_URL') ?? 'https://production-sfo.browserless.io/pdf').replace(/\/$/, '')
  return { url, apiKey }
}

async function htmlToPdfViaBrowserless(html: string, options: PdfRenderOptions): Promise<Uint8Array> {
  const config = getPdfServiceConfig()
  if (!config) throw new Error('PDF_SERVICE_API_KEY non configurée')

  const separator = config.url.includes('?') ? '&' : '?'
  const endpoint = `${config.url}${separator}token=${encodeURIComponent(config.apiKey)}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      options: {
        format: options.format ?? 'A4',
        printBackground: options.printBackground ?? true,
        margin: { ...DEFAULT_MARGINS, ...options.margin },
        preferCSSPageSize: true,
        displayHeaderFooter: false,
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Service PDF ${response.status}: ${detail.slice(0, 300)}`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Génère un PDF à partir des données du contrat.
 * Utilise Browserless si configuré, sinon repli pdf-lib.
 */
export async function renderContractToPdf(
  version: ContractDocumentVersion,
  agency: AgencyLegalProfile,
  client?: ClientProfile | null,
  layoutProfile?: LayoutProfile | null,
): Promise<{ bytes: Uint8Array; renderer: 'browserless' | 'pdf-lib' }> {
  const html = renderContractHtml(version, agency, client, {
    layoutProfile,
    showDraftNotice: false,
  })
  const config = getPdfServiceConfig()

  if (config) {
    try {
      const bytes = await htmlToPdfViaBrowserless(html, { format: 'A4', printBackground: true })
      return { bytes, renderer: 'browserless' }
    } catch (error) {
      console.warn('htmlToPdf failed, falling back to pdf-lib:', (error as Error).message)
    }
  }

  const bytes = await renderContractPdf(version, agency, client)
  return { bytes, renderer: 'pdf-lib' }
}

/** Expose le HTML pour l'aperçu sans appeler le service PDF. */
export function previewContractHtml(
  version: ContractDocumentVersion,
  agency: AgencyLegalProfile,
  client?: ClientProfile | null,
  layoutProfile?: LayoutProfile | null,
): string {
  return renderContractHtml(version, agency, client, {
    layoutProfile,
    showDraftNotice: true,
  })
}
