import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

export type DriveIntegration = {
  id: string
  access_token: string | null
  refresh_token: string | null
  config: Record<string, unknown>
}

export type DriveProject = {
  id: string
  client_name: string
  google_drive_folder_id?: string | null
  google_drive_folder_url?: string | null
}

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

function folderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`
}

async function driveFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

/** Rafraîchit le token si expiré et persiste le nouvel access_token. */
export async function getValidAccessToken(integration: DriveIntegration): Promise<string | null> {
  const config = integration.config ?? {}
  const expiresAt = typeof config.token_expires_at === 'number' ? config.token_expires_at : 0
  const now = Date.now()

  if (integration.access_token && (expiresAt === 0 || now < expiresAt - 60_000)) {
    return integration.access_token
  }

  if (!integration.refresh_token || !googleClientId || !googleClientSecret) {
    return integration.access_token
  }

  const params = new URLSearchParams({
    client_id: googleClientId,
    client_secret: googleClientSecret,
    refresh_token: integration.refresh_token,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('Google token refresh failed:', data.error ?? JSON.stringify(data))
    return null
  }

  const accessToken = data.access_token as string
  const expiresIn = Number(data.expires_in ?? 3600)
  const nextConfig = {
    ...config,
    token_expires_at: Date.now() + expiresIn * 1000,
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  await supabase
    .from('integrations')
    .update({ access_token: accessToken, config: nextConfig })
    .eq('id', integration.id)

  return accessToken
}

/** Recherche un dossier par nom (optionnel parent), sinon le crée. */
export async function findOrCreateFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const escapedName = name.replace(/'/g, "\\'")
  let q = `name='${escapedName}' and mimeType='${DRIVE_FOLDER_MIME}' and trashed=false`
  if (parentId) {
    q += ` and '${parentId}' in parents`
  } else {
    q += ` and 'root' in parents`
  }

  const listRes = await driveFetch(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
  )
  const list = await listRes.json()
  if (!listRes.ok) {
    throw new Error(`Drive list error: ${list.error?.message ?? JSON.stringify(list)}`)
  }

  const existing = list.files?.[0]?.id as string | undefined
  if (existing) return existing

  const body: Record<string, unknown> = {
    name,
    mimeType: DRIVE_FOLDER_MIME,
  }
  if (parentId) {
    body.parents = [parentId]
  }

  const createRes = await driveFetch(accessToken, '/files?fields=id', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const created = await createRes.json()
  if (!createRes.ok) {
    throw new Error(`Drive create error: ${created.error?.message ?? JSON.stringify(created)}`)
  }

  return created.id as string
}

/** Crée ou réutilise Clients/{clientName} dans le Drive connecté. */
export async function ensureClientFolder(
  accessToken: string,
  folderPrefix: string,
  clientName: string,
): Promise<{ folderId: string; folderUrl: string }> {
  const prefix = folderPrefix.trim() || 'Clients'
  const parentId = await findOrCreateFolder(accessToken, prefix)
  const clientFolderId = await findOrCreateFolder(accessToken, clientName, parentId)
  return { folderId: clientFolderId, folderUrl: folderUrl(clientFolderId) }
}

/** Vérifie qu'un dossier persisté existe encore ; retourne son URL ou null. */
export async function resolveExistingFolder(
  accessToken: string,
  folderId: string,
): Promise<{ folderId: string; folderUrl: string } | null> {
  const res = await driveFetch(
    accessToken,
    `/files/${folderId}?fields=id,trashed,mimeType`,
  )
  const file = await res.json()
  if (!res.ok || file.trashed || file.mimeType !== DRIVE_FOLDER_MIME) return null
  return { folderId: file.id as string, folderUrl: folderUrl(file.id as string) }
}

export type EnsureProjectFolderResult = { folderId: string; folderUrl: string }

/**
 * Garantit un dossier Drive pour un projet (idempotent).
 * Persiste google_drive_folder_id/url sur projects si création.
 */
export async function ensureProjectDriveFolder(
  integration: DriveIntegration,
  project: DriveProject,
): Promise<EnsureProjectFolderResult | null> {
  const accessToken = await getValidAccessToken(integration)
  if (!accessToken) {
    console.warn('Google Drive access_token not available, skipping')
    return null
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  if (project.google_drive_folder_id) {
    const existing = await resolveExistingFolder(accessToken, project.google_drive_folder_id)
    if (existing) return existing
  }

  const folderPrefix = String(integration.config?.folderPrefix ?? 'Clients')
  const result = await ensureClientFolder(accessToken, folderPrefix, project.client_name)

  await supabase
    .from('projects')
    .update({
      google_drive_folder_id: result.folderId,
      google_drive_folder_url: result.folderUrl,
    })
    .eq('id', project.id)

  console.log('Google Drive folder ensured:', result.folderId)
  return result
}

/** Signe un state OAuth (userId + timestamp). */
export async function signOAuthState(userId: string): Promise<string> {
  const ts = Date.now()
  const payload = `${userId}:${ts}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(googleClientSecret || 'fallback'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const sigHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return btoa(`${payload}:${sigHex}`)
}

/** Vérifie le state OAuth ; retourne userId ou null. */
export async function verifyOAuthState(state: string, maxAgeMs = 600_000): Promise<string | null> {
  try {
    const decoded = atob(state)
    const sigSep = decoded.lastIndexOf(':')
    if (sigSep === -1) return null
    const sigHex = decoded.slice(sigSep + 1)
    const payload = decoded.slice(0, sigSep)
    const colonIdx = payload.indexOf(':')
    if (colonIdx === -1) return null
    const userId = payload.slice(0, colonIdx)
    const ts = Number(payload.slice(colonIdx + 1))
    if (!userId || !Number.isFinite(ts) || Date.now() - ts > maxAgeMs) return null

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(googleClientSecret || 'fallback'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const expectedHex = [...new Uint8Array(expected)].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (expectedHex !== sigHex) return null
    return userId
  } catch {
    return null
  }
}

export function getGoogleOAuthRedirectUri(): string {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
  return `${supabaseUrl}/functions/v1/google-drive-oauth-callback`
}

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
