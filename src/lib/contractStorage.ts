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

export async function uploadPortalSignedContract(
  projectToken: string,
  pdfBytes: Uint8Array,
): Promise<string> {
  let binary = ''
  for (const byte of pdfBytes) binary += String.fromCharCode(byte)
  const pdfBase64 = btoa(binary)

  const { data, error } = await supabase.functions.invoke('portal-contract', {
    body: { action: 'uploadSigned', projectToken, pdfBase64 },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  if (!data?.signedUrl) throw new Error('Upload du contrat signé échoué.')
  return String(data.signedUrl)
}
