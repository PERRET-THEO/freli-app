import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildFreliEnvelope,
  buildSlackIncomingPayload,
  filterMatchingWebhooks,
  isRetryableWebhookFailure,
  isSlackIncomingWebhookUrl,
  MAX_WEBHOOKS_PER_USER,
  validateWebhookUrl,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_BACKOFF_MS,
} from './webhookHelpers.ts'

export {
  MAX_WEBHOOKS_PER_USER,
  validateWebhookUrl,
  isSlackIncomingWebhookUrl,
  buildSlackIncomingPayload,
} from './webhookHelpers.ts'

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function recordDelivery(
  supabase: SupabaseClient | null,
  row: {
    webhook_id: string
    user_id: string
    delivery_id: string
    event: string
    status: 'success' | 'failed'
    http_status?: number
    error?: string
    attempt: number
    payload_preview: string
  },
): Promise<void> {
  if (!supabase || !row.user_id) return
  const { error } = await supabase.from('webhook_deliveries').insert(row)
  if (error) {
    console.error('webhook_deliveries insert error:', error.message)
  }
}

async function deliverWebhook(
  supabase: SupabaseClient | null,
  userId: string | null,
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
  const slack = isSlackIncomingWebhookUrl(validated.url)
  const body = slack
    ? JSON.stringify(buildSlackIncomingPayload(event, data))
    : JSON.stringify(buildFreliEnvelope(event, data))
  const payloadPreview = body.length > 500 ? `${body.slice(0, 500)}…` : body

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Freli-Webhooks/1.0',
    'X-Freli-Event': event,
    'X-Freli-Delivery-Id': deliveryId,
  }

  // Slack Incoming Webhooks ignore custom signatures; only sign Freli envelopes.
  const secret = endpoint.access_token ?? ''
  if (secret && !slack) {
    headers['X-Freli-Signature'] = `sha256=${await hmacSha256Hex(secret, body)}`
  }

  let lastError: string | undefined
  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

    try {
      const res = await fetch(validated.url.toString(), {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
      lastStatus = res.status

      if (res.ok) {
        await recordDelivery(supabase, {
          webhook_id: endpoint.id,
          user_id: userId ?? '',
          delivery_id: deliveryId,
          event,
          status: 'success',
          http_status: res.status,
          attempt,
          payload_preview: payloadPreview,
        })
        console.log(
          `webhook delivered webhook_id=${endpoint.id} delivery_id=${deliveryId} event=${event} status=${res.status} attempt=${attempt}`,
        )
        return { ok: true, status: res.status }
      }

      lastError = `HTTP ${res.status}`
      const retryable = isRetryableWebhookFailure(res.status, false)
      await recordDelivery(supabase, {
        webhook_id: endpoint.id,
        user_id: userId ?? '',
        delivery_id: deliveryId,
        event,
        status: 'failed',
        http_status: res.status,
        error: lastError,
        attempt,
        payload_preview: payloadPreview,
      })

      if (!retryable || attempt >= WEBHOOK_MAX_ATTEMPTS) {
        console.error(
          `webhook delivery failed webhook_id=${endpoint.id} event=${event} status=${res.status} attempt=${attempt}`,
        )
        return { ok: false, status: res.status, error: lastError }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      lastError = message
      await recordDelivery(supabase, {
        webhook_id: endpoint.id,
        user_id: userId ?? '',
        delivery_id: deliveryId,
        event,
        status: 'failed',
        error: message,
        attempt,
        payload_preview: payloadPreview,
      })

      if (attempt >= WEBHOOK_MAX_ATTEMPTS) {
        console.error(`webhook delivery error webhook_id=${endpoint.id} event=${event}:`, message)
        return { ok: false, error: message }
      }
    } finally {
      clearTimeout(timeout)
    }

    const backoff = WEBHOOK_RETRY_BACKOFF_MS[attempt - 1] ?? 3000
    await sleep(backoff)
  }

  return { ok: false, status: lastStatus, error: lastError ?? 'Delivery failed' }
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
  const matching = filterMatchingWebhooks(endpoints, event)

  if (matching.length === 0) return

  await Promise.allSettled(
    matching.map((endpoint) => deliverWebhook(supabase, userId, endpoint, event, data)),
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
  supabase: SupabaseClient,
  userId: string,
  endpoint: WebhookEndpoint,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  return deliverWebhook(supabase, userId, endpoint, event, data)
}
