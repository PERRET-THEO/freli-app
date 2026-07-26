/** Pure webhook helpers (no Deno env) — shared by Edge delivery + Vitest. */

export const MAX_WEBHOOKS_PER_USER = 5
export const WEBHOOK_MAX_ATTEMPTS = 3
export const WEBHOOK_RETRY_BACKOFF_MS = [500, 1500, 3000] as const

export const WEBHOOK_EVENT_TITLES: Record<string, string> = {
  'project.created': 'Projet créé',
  'project.completed': 'Onboarding terminé',
  'payment.received': 'Paiement reçu',
  'project.reminder_sent': 'Relance envoyée',
  'webhook.test': 'Test webhook Freli',
}

export function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((p) => parseInt(p, 10))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  return false
}

/** Blocks literal private / local hostnames. Does not resolve DNS (Edge limitation). */
export function isBlockedWebhookHostname(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '0:0:0:0:0:0:0:1'
  ) {
    return true
  }
  // IPv6 link-local fe80::/10
  if (h.startsWith('fe80:')) return true
  // IPv6 ULA fc00::/7 (fc00–fdff)
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true
  // IPv6 multicast ff00::/8
  if (/^ff[0-9a-f]{2}:/i.test(h)) return true
  if (isPrivateIpv4(h)) return true
  return false
}

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

  if (isBlockedWebhookHostname(parsed.hostname)) {
    return { ok: false, error: 'URL non autorisée.' }
  }

  return { ok: true, url: parsed }
}

export function isSlackIncomingWebhookUrl(url: URL | string): boolean {
  try {
    const host = (typeof url === 'string' ? new URL(url) : url).hostname.toLowerCase()
    return host === 'hooks.slack.com'
  } catch {
    return false
  }
}

export function isRetryableWebhookFailure(status?: number, networkError?: boolean): boolean {
  if (networkError) return true
  if (status === undefined) return false
  if (status === 429) return true
  if (status >= 500) return true
  return false
}

type SlackProject = {
  client_name?: unknown
  client_email?: unknown
  status?: unknown
  price?: unknown
  payment_status?: unknown
  portal_url?: unknown
  dashboard_url?: unknown
}

export function buildSlackIncomingPayload(
  event: string,
  data: Record<string, unknown>,
): { text: string; blocks: Record<string, unknown>[] } {
  const project = (data.project ?? {}) as SlackProject
  const agency = (data.agency ?? {}) as { name?: unknown }
  const meta = (data.meta ?? {}) as Record<string, unknown>
  const title = WEBHOOK_EVENT_TITLES[event] ?? event
  const client = String(project.client_name ?? 'Client')
  const agencyName = String(agency.name ?? 'Agence')
  const text = `${title} — ${client} (${agencyName})`

  const fields: { type: string; text: string }[] = [
    { type: 'mrkdwn', text: `*Client:*\n${client}` },
    {
      type: 'mrkdwn',
      text: `*Email:*\n${project.client_email ? String(project.client_email) : '—'}`,
    },
  ]
  if (project.status != null) {
    fields.push({ type: 'mrkdwn', text: `*Statut:*\n${String(project.status)}` })
  }
  if (project.price != null) {
    fields.push({ type: 'mrkdwn', text: `*Prix:*\n${String(project.price)} €` })
  }
  if (project.payment_status != null) {
    fields.push({ type: 'mrkdwn', text: `*Paiement:*\n${String(project.payment_status)}` })
  }
  if (typeof meta.amount_cents === 'number') {
    fields.push({
      type: 'mrkdwn',
      text: `*Montant:*\n${(meta.amount_cents / 100).toFixed(2)} ${String(meta.currency ?? 'eur').toUpperCase()}`,
    })
  }

  const links: string[] = []
  if (typeof project.portal_url === 'string' && project.portal_url) {
    links.push(`<${project.portal_url}|Portail client>`)
  }
  if (typeof project.dashboard_url === 'string' && project.dashboard_url) {
    links.push(`<${project.dashboard_url}|Dashboard>`)
  }

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: title, emoji: true },
    },
    {
      type: 'section',
      fields: fields.slice(0, 10),
    },
  ]
  if (links.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: links.join(' · ') },
    })
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Freli · \`${event}\`` }],
  })

  return { text, blocks }
}

export function buildFreliEnvelope(
  event: string,
  data: Record<string, unknown>,
  timestamp = new Date().toISOString(),
): { event: string; timestamp: string; data: Record<string, unknown> } {
  return { event, timestamp, data }
}

export function filterMatchingWebhooks<
  T extends { config?: { enabled?: boolean; events?: string[] } },
>(endpoints: T[], event: string): T[] {
  return endpoints.filter((row) => {
    if (row.config?.enabled === false) return false
    const events = Array.isArray(row.config?.events) ? row.config.events : []
    return events.includes(event)
  })
}
