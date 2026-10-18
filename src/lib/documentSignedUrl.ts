import { supabase } from './supabase'

/** Signed GET court (60–300 s côté EF) pour un path documents. */
export async function createDocumentSignedUrl(path: string): Promise<string | null> {
  const cleaned = path.trim()
  if (!cleaned) return null
  if (cleaned.startsWith('http')) return cleaned

  const { data, error } = await supabase.functions.invoke('create-document-signed-url', {
    body: { path: cleaned },
  })
  if (error) {
    console.error('create-document-signed-url:', error.message)
    return null
  }
  if (data?.error || !data?.signedUrl) return null
  return String(data.signedUrl)
}
