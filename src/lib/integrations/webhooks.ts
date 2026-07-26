export const WEBHOOK_EVENTS = [
  'project.created',
  'project.completed',
  'payment.received',
  'project.reminder_sent',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export type WebhookConfig = {
  url: string
  label: string
  events: WebhookEvent[]
  enabled: boolean
}

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, { label: string; description: string }> = {
  'project.created': {
    label: 'Projet créé',
    description: 'Quand un nouveau projet est créé et l\u2019invitation envoyée.',
  },
  'project.completed': {
    label: 'Onboarding terminé',
    description: 'Quand le client a complété toutes les étapes.',
  },
  'payment.received': {
    label: 'Paiement reçu',
    description: 'Quand le client a payé via Stripe.',
  },
  'project.reminder_sent': {
    label: 'Relance envoyée',
    description: 'Quand une relance email est envoyée au client.',
  },
}

export const MAX_WEBHOOKS_PER_USER = 5

export type WebhookSetupCategory = 'automator' | 'notification' | 'productivity' | 'finance'

export type WebhookSetupGuide = {
  id: string
  name: string
  category: WebhookSetupCategory
  summary: string
  detail?: string
  viaAutomator?: string
}

export const WEBHOOK_SETUP_GUIDE_CATEGORIES: Record<
  WebhookSetupCategory,
  { label: string; description: string }
> = {
  automator: {
    label: 'Automatisateurs',
    description: 'Ces outils fournissent une URL à coller directement dans Freli.',
  },
  notification: {
    label: 'Notifications',
    description: 'Recevez chaque événement dans votre messagerie d\u2019équipe.',
  },
  productivity: {
    label: 'Bases & CRM',
    description: 'Créez automatiquement une fiche, une ligne ou un contact.',
  },
  finance: {
    label: 'Comptabilité',
    description: 'Transmettez les projets et paiements à votre outil comptable.',
  },
}

const VIA_AUTOMATOR = 'Zapier, Make ou n8n'
const VIA_AUTOMATOR_DETAIL =
  'Collez dans Freli l\u2019URL du webhook de l\u2019automatisateur, pas celle de l\u2019outil de destination.'

export const WEBHOOK_SETUP_GUIDES: WebhookSetupGuide[] = [
  {
    id: 'zapier',
    name: 'Zapier',
    category: 'automator',
    summary: 'Créer un Zap → Webhooks by Zapier → Catch Hook → copier l\u2019URL.',
  },
  {
    id: 'make',
    name: 'Make',
    category: 'automator',
    summary: 'Nouveau scénario → Webhooks → Custom webhook → copier l\u2019URL.',
  },
  {
    id: 'n8n',
    name: 'n8n',
    category: 'automator',
    summary: 'Nouveau workflow → nœud Webhook → méthode POST → copier l\u2019URL de production.',
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'notification',
    summary:
      'Slack → Apps → Incoming Webhooks → ajouter à un canal → copier l\u2019URL. Freli formate automatiquement le message ({ text, blocks }).',
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'productivity',
    summary: 'Webhook → Créer une page ou une ligne dans une base.',
    detail: VIA_AUTOMATOR_DETAIL,
    viaAutomator: VIA_AUTOMATOR,
  },
  {
    id: 'airtable',
    name: 'Airtable',
    category: 'productivity',
    summary: 'Webhook → Créer un enregistrement dans une base.',
    detail: VIA_AUTOMATOR_DETAIL,
    viaAutomator: VIA_AUTOMATOR,
  },
  {
    id: 'crm',
    name: 'CRM perso',
    category: 'productivity',
    summary: 'Webhook → créer un contact (Notion, Airtable, Google Sheets, etc.).',
    detail: VIA_AUTOMATOR_DETAIL,
    viaAutomator: VIA_AUTOMATOR,
  },
  {
    id: 'compta',
    name: 'Comptabilité',
    category: 'finance',
    summary: 'Webhook → Pennylane, Tiime, Indy ou export vers votre outil comptable.',
    detail: VIA_AUTOMATOR_DETAIL,
    viaAutomator: VIA_AUTOMATOR,
  },
]

export function parseWebhookConfig(raw: Record<string, unknown> | null | undefined): WebhookConfig {
  const events = Array.isArray(raw?.events)
    ? (raw.events as string[]).filter((e): e is WebhookEvent =>
        (WEBHOOK_EVENTS as readonly string[]).includes(e),
      )
    : []
  return {
    url: typeof raw?.url === 'string' ? raw.url : '',
    label: typeof raw?.label === 'string' ? raw.label : 'Webhook',
    events,
    enabled: raw?.enabled !== false,
  }
}

export function maskWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname
    const maskedPath =
      path.length > 12 ? `${path.slice(0, 8)}…${path.slice(-4)}` : path
    return `${parsed.hostname}${maskedPath}`
  } catch {
    return 'URL invalide'
  }
}

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

/** Aligné sur supabase/functions/_shared/webhookHelpers.ts (sans resolve DNS). */
function isBlockedWebhookHostname(host: string): boolean {
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
  if (h.startsWith('fe80:')) return true
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true
  if (/^ff[0-9a-f]{2}:/i.test(h)) return true
  if (isPrivateIpv4(h)) return true
  return false
}

export function validateWebhookUrlClient(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return 'URL requise.'
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return 'L\u2019URL doit utiliser HTTPS.'
    if (isBlockedWebhookHostname(parsed.hostname)) return 'URL non autorisée.'
  } catch {
    return 'URL invalide.'
  }
  return null
}

export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
