import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const WEBHOOK_EVENTS = [
  'project.created',
  'project.completed',
  'payment.received',
  'project.reminder_sent',
  'webhook.test',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export type WebhookEndpoint = {
  id: string
  access_token: string | null
  config: {
    url?: string
    label?: string
    events?: string[]
    enabled?: boolean
  }
}

export type ProjectRow = {
  id: string
  client_name: string
  client_email: string | null
  agency_id: string
  token: string
  status?: string | null
  price?: number | null
  payment_status?: string | null
  stripe_checkout_url?: string | null
  google_drive_folder_url?: string | null
}

export type ChecklistItemRow = {
  label: string
  type: string
  completed: boolean
}

const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')
const WEBHOOK_TIMEOUT_MS = 10_000
export const MAX_WEBHOOKS_PER_USER = 5

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((p) => parseInt(p, 10))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  return false
}

/** Validates webhook URL (HTTPS, no localhost/private targets). */
export function validateWebhookUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return { ok: false, error: 'URL invalide.' }
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'L\u2019URL doit utiliser HTTPS.' }
  }

  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1'
  ) {
    return { ok: false, error: 'URL non autorisée.' }
  }

  if (isPrivateIpv4(host)) {
    return { ok: false, error: 'URL non autorisée.' }
  }

  return { ok: true, url: parsed }
}

export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getAgencyUserId(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('agencies')
    .select('user_id')
    .eq('id', agencyId)
    .single()
  if (error || !data?.user_id) return null
  return data.user_id as string
}

export function buildProjectPayload(
  project: ProjectRow,
  agency: { id: string; name: string },
  extras?: {
    checklist?: ChecklistItemRow[]
    meta?: Record<string, unknown>
    integrations?: Record<string, unknown>
  },
): Record<string, unknown> {
  return {
    project: {
      id: project.id,
      client_name: project.client_name,
      client_email: project.client_email,
      status: project.status ?? null,
      price: project.price ?? null,
      payment_status: project.payment_status ?? null,
      portal_url: `${appUrl}/p/${project.token}`,
      dashboard_url: `${appUrl}/dashboard/project/${project.id}`,
      stripe_checkout_url: project.stripe_checkout_url ?? null,
      google_drive_folder_url: project.google_drive_folder_url ?? null,
    },
    agency: { id: agency.id, name: agency.name },
    ...(extras?.checklist ? { checklist: extras.checklist } : {}),
    ...(extras?.integrations ? { integrations: extras.integrations } : {}),
    meta: extras?.meta ?? {},
  }
}

export async function fetchChecklistItems(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ChecklistItemRow[]> {
  const { data } = await supabase
    .from('checklist_items')
    .select('label, type, completed')
    .eq('project_id', projectId)
    .order('order_index', { ascending: true })
  return (data ?? []) as ChecklistItemRow[]
}

async function deliverWebhook(
  endpoint: WebhookEndpoint,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = String(endpoint.config?.url ?? '').trim()
  const validated = validateWebhookUrl(url)
  if (!validated.ok) {
    return { ok: false, error: validated.error }
  }

  const deliveryId = crypto.randomUUID()
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Freli-Webhooks/1.0',
    'X-Freli-Event': event,
    'X-Freli-Delivery-Id': deliveryId,
  }

  const secret = endpoint.access_token ?? ''
  if (secret) {
    headers['X-Freli-Signature'] = `sha256=${await hmacSha256Hex(secret, body)}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

  try {
    const res = await fetch(validated.url.toString(), {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      console.error(
        `webhook delivery failed webhook_id=${endpoint.id} event=${event} status=${res.status}`,
      )
      return { ok: false, status: res.status, error: `HTTP ${res.status}` }
    }
    console.log(
      `webhook delivered webhook_id=${endpoint.id} delivery_id=${deliveryId} event=${event} status=${res.status}`,
    )
    return { ok: true, status: res.status }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`webhook delivery error webhook_id=${endpoint.id} event=${event}:`, message)
    return { ok: false, error: message }
  } finally {
    clearTimeout(timeout)
  }
}

export async function dispatchOutgoingWebhooks(
  supabase: SupabaseClient,
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from('integrations')
    .select('id, access_token, config')
    .eq('user_id', userId)
    .eq('provider', 'webhook')

  if (error) {
    console.error('dispatchOutgoingWebhooks fetch error:', error.message)
    return
  }

  const endpoints = (rows ?? []) as WebhookEndpoint[]
  const matching = endpoints.filter((row) => {
    if (row.config?.enabled === false) return false
    const events = Array.isArray(row.config?.events) ? row.config.events : []
    return events.includes(event)
  })

  if (matching.length === 0) return

  await Promise.allSettled(
    matching.map((endpoint) => deliverWebhook(endpoint, event, data)),
  )
}

/** Fire-and-forget wrapper — never throws. */
export function fireOutgoingWebhooks(
  supabase: SupabaseClient,
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): void {
  void dispatchOutgoingWebhooks(supabase, userId, event, data).catch((e) => {
    console.error(`fireOutgoingWebhooks ${event}:`, e instanceof Error ? e.message : String(e))
  })
}

export async function dispatchToSingleWebhook(
  endpoint: WebhookEndpoint,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  return deliverWebhook(endpoint, event, data)
}
