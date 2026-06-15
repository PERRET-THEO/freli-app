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
    console.error('Google Drive token refresh unavailable (missing refresh_token or OAuth secrets)')
    return null
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
    throw new Error('Session Google Drive expirée. Reconnectez Google Drive dans Intégrations.')
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

const DRIVE_UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name'

/** Nettoie un nom de fichier pour Google Drive. */
export function sanitizeDriveFileName(label: string, ext?: string): string {
  const base = (label || 'fichier')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  if (!ext) return base
  const cleanExt = ext.replace(/^\.+/, '')
  return base.toLowerCase().endsWith(`.${cleanExt.toLowerCase()}`) ? base : `${base}.${cleanExt}`
}

/** Upload binaire vers un dossier Drive (multipart). */
export async function uploadBytesToDrive(
  accessToken: string,
  folderId: string,
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<{ id: string; name: string }> {
  const boundary = `freli-${crypto.randomUUID()}`
  const metadata = JSON.stringify({ name, parents: [folderId] })

  const encoder = new TextEncoder()
  const head = encoder.encode(
    `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  )
  const tail = encoder.encode(`\r\n--${boundary}--`)

  const body = new Uint8Array(head.length + bytes.length + tail.length)
  body.set(head, 0)
  body.set(bytes, head.length)
  body.set(tail, head.length + bytes.length)

  const res = await fetch(DRIVE_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Drive upload error: ${data.error?.message ?? JSON.stringify(data)}`)
  }
  return { id: data.id as string, name: data.name as string }
}

/** Extrait le chemin d'un objet depuis une URL publique Supabase Storage. */
export function extractStoragePathFromPublicUrl(
  url: string,
): { bucket: string; path: string } | null {
  const marker = '/storage/v1/object/public/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const rest = url.slice(idx + marker.length)
  const slash = rest.indexOf('/')
  if (slash === -1) return null
  const bucket = rest.slice(0, slash)
  const path = decodeURIComponent(rest.slice(slash + 1))
  return { bucket, path }
}

function guessExtension(name: string, fallback = 'bin'): string {
  const dot = name.lastIndexOf('.')
  if (dot === -1 || dot === name.length - 1) return fallback
  return name.slice(dot + 1)
}

type ChecklistItem = {
  id: string
  label: string
  type: 'text' | 'file' | 'signature'
  value: string | null
  completed: boolean
  order_index: number
}

type ResolvedArtifact = {
  bytes: Uint8Array
  fileName: string
  mimeType: string
}

async function resolveStorageBytes(
  supabase: ReturnType<typeof createClient>,
  item: ChecklistItem,
  orderLabel: string,
): Promise<ResolvedArtifact | null> {
  const value = item.value?.trim()
  if (!value) return null

  if (item.type === 'file') {
    const { data, error } = await supabase.storage.from('documents').download(value)
    if (error || !data) {
      console.error(`Drive sync: download documents/${value} failed:`, error?.message)
      return null
    }
    const bytes = new Uint8Array(await data.arrayBuffer())
    const originalName = value.split('/').pop() ?? 'fichier'
    const ext = guessExtension(originalName)
    return {
      bytes,
      fileName: sanitizeDriveFileName(`${orderLabel}_${item.label}`, ext),
      mimeType: data.type || 'application/octet-stream',
    }
  }

  if (item.type === 'signature') {
    const parsed = extractStoragePathFromPublicUrl(value)
    let bytes: Uint8Array | null = null
    if (parsed) {
      const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path)
      if (!error && data) bytes = new Uint8Array(await data.arrayBuffer())
    }
    if (!bytes) {
      try {
        const res = await fetch(value)
        if (res.ok) bytes = new Uint8Array(await res.arrayBuffer())
      } catch (e) {
        console.error('Drive sync: signature fetch failed:', e instanceof Error ? e.message : e)
      }
    }
    if (!bytes) return null
    return {
      bytes,
      fileName: sanitizeDriveFileName(`${orderLabel}_${item.label}_signe`, 'pdf'),
      mimeType: 'application/pdf',
    }
  }

  return null
}

function buildRecapText(
  project: { client_name: string; client_email?: string | null },
  items: ChecklistItem[],
): string {
  const lines = [
    `Projet : ${project.client_name}`,
    project.client_email ? `Client : ${project.client_email}` : null,
    `Date : ${new Date().toISOString().slice(0, 10)}`,
    '',
  ].filter(Boolean) as string[]

  for (const item of items) {
    const mark = item.completed ? '[x]' : '[ ]'
    const suffix = item.type === 'text' && item.value ? ` : ${item.value}` : ''
    lines.push(`${mark} ${item.label} (${item.type})${suffix}`)
  }
  return lines.join('\n')
}

export type DriveSyncResult = {
  uploaded: number
  skipped: number
  failed: number
  status: 'synced' | 'partial' | 'failed'
}

/**
 * Copie les pièces du projet (fichiers, signatures, recap) dans le dossier Drive.
 * Idempotent via project_drive_files. Ne lève pas : retourne un statut agrégé.
 */
export async function syncProjectArtifactsToDrive(
  integration: DriveIntegration,
  projectId: string,
  folderId: string,
): Promise<DriveSyncResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const accessToken = await getValidAccessToken(integration)
  if (!accessToken) {
    return { uploaded: 0, skipped: 0, failed: 0, status: 'failed' }
  }

  const { data: projectRow } = await supabase
    .from('projects')
    .select('id, client_name, client_email')
    .eq('id', projectId)
    .single()

  const { data: itemsData } = await supabase
    .from('checklist_items')
    .select('id, label, type, value, completed, order_index')
    .eq('project_id', projectId)
    .order('order_index', { ascending: true })

  const items = (itemsData ?? []) as ChecklistItem[]

  const { data: existingRows } = await supabase
    .from('project_drive_files')
    .select('source_kind, source_key')
    .eq('project_id', projectId)
  const existing = new Set(
    (existingRows ?? []).map((r) => `${r.source_kind}:${r.source_key}`),
  )

  let uploaded = 0
  let skipped = 0
  let failed = 0

  const persist = async (
    kind: string,
    key: string,
    checklistItemId: string | null,
    file: { id: string; name: string },
  ) => {
    await supabase.from('project_drive_files').insert({
      project_id: projectId,
      checklist_item_id: checklistItemId,
      source_kind: kind,
      source_key: key,
      drive_file_id: file.id,
      drive_file_name: file.name,
    })
  }

  for (const item of items) {
    if (item.type !== 'file' && item.type !== 'signature') continue
    const kind = item.type === 'file' ? 'checklist_file' : 'checklist_signature'
    if (existing.has(`${kind}:${item.id}`)) {
      skipped += 1
      continue
    }

    const orderLabel = String(item.order_index + 1).padStart(2, '0')
    try {
      const artifact = await resolveStorageBytes(supabase, item, orderLabel)
      if (!artifact) {
        failed += 1
        continue
      }
      const file = await uploadBytesToDrive(
        accessToken,
        folderId,
        artifact.fileName,
        artifact.mimeType,
        artifact.bytes,
      )
      await persist(kind, item.id, item.id, file)
      uploaded += 1
    } catch (e) {
      console.error(`Drive sync item ${item.id} failed:`, e instanceof Error ? e.message : e)
      failed += 1
    }
  }

  if (!existing.has('checklist_recap:recap') && projectRow) {
    try {
      const recap = buildRecapText(projectRow, items)
      const file = await uploadBytesToDrive(
        accessToken,
        folderId,
        'freli-recap-checklist.txt',
        'text/plain; charset=UTF-8',
        new TextEncoder().encode(recap),
      )
      await persist('checklist_recap', 'recap', null, file)
      uploaded += 1
    } catch (e) {
      console.error('Drive sync recap failed:', e instanceof Error ? e.message : e)
      failed += 1
    }
  } else if (existing.has('checklist_recap:recap')) {
    skipped += 1
  }

  const status: DriveSyncResult['status'] =
    failed === 0 ? 'synced' : uploaded > 0 ? 'partial' : 'failed'

  await supabase
    .from('projects')
    .update({
      google_drive_files_synced_at: new Date().toISOString(),
      google_drive_sync_status: status,
    })
    .eq('id', projectId)

  return { uploaded, skipped, failed, status }
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
