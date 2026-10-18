/**
 * AES-256-GCM pour checklist_item_secrets.
 * Clé : FRELI_SECRETS_KEY_V1 (32 bytes, base64 ou hex). Fail closed.
 * AAD : `${checklistItemId}:${projectId}`
 */

export type CredentialsPayload = {
  username: string
  password: string
  loginUrl?: string
}

export type LegacyCredentialsPayload = {
  legacy: string
}

export type SecretPayload = CredentialsPayload | LegacyCredentialsPayload

export class SecretsKeyError extends Error {
  constructor(message = 'FRELI_SECRETS_KEY_V1 missing or invalid') {
    super(message)
    this.name = 'SecretsKeyError'
  }
}

function decodeKeyMaterial(raw: string): Uint8Array {
  const trimmed = raw.trim()
  if (!trimmed) throw new SecretsKeyError()

  // hex 64 chars
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const out = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16)
    }
    return out
  }

  // base64 / base64url
  try {
    const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    const binary = atob(normalized + pad)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    if (out.length !== 32) throw new SecretsKeyError()
    return out
  } catch {
    throw new SecretsKeyError()
  }
}

let cachedKey: CryptoKey | null = null

export async function loadSecretsKeyV1(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const raw = Deno.env.get('FRELI_SECRETS_KEY_V1') ?? ''
  const bytes = decodeKeyMaterial(raw)
  cachedKey = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
  return cachedKey
}

export function buildSecretsAad(checklistItemId: string, projectId: string): Uint8Array {
  return new TextEncoder().encode(`${checklistItemId}:${projectId}`)
}

export function isSafeLoginUrl(raw: string | null | undefined): boolean {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return true
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeLoginUrl(raw: string | null | undefined): string | undefined {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return undefined
  if (!isSafeLoginUrl(trimmed)) {
    throw new Error('invalid_login_url')
  }
  return trimmed
}

export function validateCredentialsBody(body: {
  username?: unknown
  password?: unknown
  loginUrl?: unknown
}): CredentialsPayload {
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username) throw new Error('username_required')
  if (!password) throw new Error('password_required')
  const loginUrl = normalizeLoginUrl(
    typeof body.loginUrl === 'string' ? body.loginUrl : undefined,
  )
  const payload: CredentialsPayload = { username, password }
  if (loginUrl) payload.loginUrl = loginUrl
  return payload
}

export async function encryptSecretPayload(
  payload: SecretPayload,
  checklistItemId: string,
  projectId: string,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array; keyVersion: number }> {
  const key = await loadSecretsKeyV1()
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const aad = buildSecretsAad(checklistItemId, projectId)
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad },
    key,
    plaintext,
  )
  return { ciphertext: new Uint8Array(encrypted), nonce, keyVersion: 1 }
}

export async function decryptSecretPayload(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  checklistItemId: string,
  projectId: string,
  keyVersion = 1,
): Promise<SecretPayload> {
  if (keyVersion !== 1) throw new SecretsKeyError(`unsupported key_version ${keyVersion}`)
  const key = await loadSecretsKeyV1()
  const aad = buildSecretsAad(checklistItemId, projectId)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad },
    key,
    ciphertext,
  )
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as SecretPayload
  if ('legacy' in parsed && typeof parsed.legacy === 'string') {
    return { legacy: parsed.legacy }
  }
  if (
    typeof (parsed as CredentialsPayload).username === 'string' &&
    typeof (parsed as CredentialsPayload).password === 'string'
  ) {
    const creds = parsed as CredentialsPayload
    if (creds.loginUrl && !isSafeLoginUrl(creds.loginUrl)) {
      return { username: creds.username, password: creds.password }
    }
    return creds
  }
  throw new Error('invalid_secret_payload')
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Encode pour upsert PostgREST (bytea hex). */
export function bytesToHex(bytes: Uint8Array): string {
  return '\\x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('\\x') ? hex.slice(2) : hex.startsWith('0x') ? hex.slice(2) : hex
  if (cleaned.length % 2 !== 0) throw new Error('invalid_hex')
  const out = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
} as const

export const LEGACY_LABEL_REGEX =
  /(acc[eè]s|mot de passe|mdp|identifiant|login|password|compte)/i

export const REVEAL_RATE_LIMIT = 10
export const REVEAL_RATE_WINDOW_MS = 5 * 60 * 1000
