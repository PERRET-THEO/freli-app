const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/zip',
])

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  zip: 'application/zip',
}

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const SIGNED_URL_TTL_SECONDS = 180

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file'
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120)
  return cleaned || 'file'
}

export function resolveMimeType(filename: string, declared?: string | null): string | null {
  const declaredNorm = (declared ?? '').toLowerCase().trim()
  if (declaredNorm === 'image/jpg') return 'image/jpeg'
  if (ALLOWED_MIME.has(declaredNorm)) return declaredNorm
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? null
}

export function isAllowedMime(mime: string | null): mime is string {
  return !!mime && ALLOWED_MIME.has(mime)
}

export function buildDocumentStoragePath(
  projectId: string,
  itemId: string,
  filename: string,
): string {
  const uuid = crypto.randomUUID()
  return `${projectId}/${itemId}/${uuid}-${sanitizeFilename(filename)}`
}

/** Nouveau format : {project_id}/{item_id}/… */
export function isProjectScopedPath(path: string, projectId: string, itemId?: string): boolean {
  if (itemId) return path.startsWith(`${projectId}/${itemId}/`)
  return path.startsWith(`${projectId}/`)
}

/** Legacy : {token}/… */
export function isLegacyTokenPath(path: string, token: string): boolean {
  return path.startsWith(`${token}/`)
}

export function extractDocumentsPathFromUrl(value: string): string | null {
  const markers = [
    '/storage/v1/object/public/documents/',
    '/storage/v1/object/sign/documents/',
    '/storage/v1/object/authenticated/documents/',
  ]
  for (const marker of markers) {
    const idx = value.indexOf(marker)
    if (idx !== -1) {
      const rest = value.slice(idx + marker.length)
      return decodeURIComponent(rest.split('?')[0] ?? '')
    }
  }
  return null
}

export function normalizeDocumentValueToPath(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('http')) return value
  return extractDocumentsPathFromUrl(value)
}

const UUID_FILENAME_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i

export function displayDocumentFilename(pathOrName: string): string {
  const base = pathOrName.split('/').pop() ?? pathOrName
  return base.replace(UUID_FILENAME_PREFIX, '') || base
}

export function parseDeclaredFileSize(body: {
  fileSize?: unknown
  size?: unknown
  file_size?: unknown
}): number | null {
  const raw = body.fileSize ?? body.size ?? body.file_size
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function assertSafeStoragePath(path: string): boolean {
  if (!path || path.includes('..') || path.includes('\\') || path.startsWith('/')) return false
  return true
}
