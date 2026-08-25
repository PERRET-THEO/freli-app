import { supabase } from './supabase'

export function isStoragePath(pdfUrl: string | null | undefined): boolean {
  if (!pdfUrl) return false
  return !pdfUrl.startsWith('http')
}

export function storagePathFromPdfUrl(pdfUrl: string): string | null {
  if (!pdfUrl.startsWith('http')) return pdfUrl
  const publicMarker = '/storage/v1/object/public/contracts/'
  const publicIdx = pdfUrl.indexOf(publicMarker)
  if (publicIdx !== -1) return pdfUrl.slice(publicIdx + publicMarker.length)
  return null
}

export async function resolveAgencyContractPdfUrl(
  pdfUrl: string | null | undefined,
): Promise<string | null> {
  if (!pdfUrl) return null
  if (pdfUrl.startsWith('http') && !pdfUrl.includes('/storage/v1/object/')) return pdfUrl

  const path = storagePathFromPdfUrl(pdfUrl) ?? (isStoragePath(pdfUrl) ? pdfUrl : null)
  if (!path) return pdfUrl

  const { data, error } = await supabase.storage.from('contracts').createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return pdfUrl.startsWith('http') ? pdfUrl : null
  return data.signedUrl
}

export async function getPortalTemplatePdfUrl(
  projectToken: string,
  templateId: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('portal-contract', {
    body: { action: 'getTemplatePdfUrl', projectToken, templateId },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  if (!data?.signedUrl) throw new Error('URL du PDF indisponible.')
  return String(data.signedUrl)
}

export type PortalGeneratedDocumentContract = {
  signedUrl: string
  name: string
  signature_page: number
  signature_x: number
  signature_y: number
  signature_width: number
  signature_height: number
}

export async function getPortalGeneratedDocumentPdfUrl(
  projectToken: string,
  generatedDocumentId: string,
): Promise<PortalGeneratedDocumentContract> {
  const { data, error } = await supabase.functions.invoke('portal-contract', {
    body: { action: 'getGeneratedDocumentPdfUrl', projectToken, generatedDocumentId },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  if (!data?.signedUrl) throw new Error('URL du PDF indisponible.')
  return {
    signedUrl: String(data.signedUrl),
    name: String(data.name ?? 'Contrat'),
    signature_page: Number(data.signature_page ?? -1),
    signature_x: Number(data.signature_x ?? 0.7),
    signature_y: Number(data.signature_y ?? 0.85),
    signature_width: Number(data.signature_width ?? 0.25),
    signature_height: Number(data.signature_height ?? 0.08),
  }
}

export type SignerIdentity = {
  checklistItemId?: string
  signerName?: string
  signerEmail?: string
}

export async function uploadPortalSignedContract(
  projectToken: string,
  pdfBytes: Uint8Array,
  signer: SignerIdentity = {},
): Promise<string> {
  let binary = ''
  for (const byte of pdfBytes) binary += String.fromCharCode(byte)
  const pdfBase64 = btoa(binary)

  const { data, error } = await supabase.functions.invoke('portal-contract', {
    body: { action: 'uploadSigned', projectToken, pdfBase64, ...signer },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  if (!data?.signedUrl) throw new Error('Upload du contrat signé échoué.')
  return String(data.signedUrl)
}
