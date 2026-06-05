import { supabase } from './supabase'

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

/** Crée le dossier Drive pour un projet déjà terminé (rattrapage). */
export async function syncProjectDriveFolder(projectId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('google-drive-sync-project', {
    body: { projectId },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  return String(data.folderUrl ?? '')
}
