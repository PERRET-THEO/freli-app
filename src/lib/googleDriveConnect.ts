import { supabase } from './supabase'

async function readInvokeError(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const response = (error as { context?: Response }).context
  if (!response?.clone) return null
  try {
    const body = (await response.clone().json()) as { error?: string }
    return body.error ? String(body.error) : null
  } catch {
    return null
  }
}

/** Lance le flux OAuth Google Drive (redirect vers Google). */
export async function startGoogleDriveOAuth(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('google-drive-oauth-start', {
    body: {},
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))

  const url = data?.url as string | undefined
  if (!url) throw new Error('Réponse Google inattendue')

  window.location.href = url
}

export type DriveSyncResponse = {
  folderUrl: string
  filesUploaded: number
  filesSkipped: number
  status: 'synced' | 'partial' | 'failed' | null
}

/** Crée le dossier Drive et synchronise les fichiers d'un projet terminé (rattrapage). */
export async function syncProjectDriveFolder(projectId: string): Promise<DriveSyncResponse> {
  const { data, error } = await supabase.functions.invoke('google-drive-sync-project', {
    body: { projectId },
  })
  if (data?.error) throw new Error(String(data.error))
  if (error) {
    const detail = await readInvokeError(error)
    throw new Error(detail ?? error.message)
  }
  return {
    folderUrl: String(data.folderUrl ?? ''),
    filesUploaded: Number(data.filesUploaded ?? 0),
    filesSkipped: Number(data.filesSkipped ?? 0),
    status: (data.status ?? null) as DriveSyncResponse['status'],
  }
}
