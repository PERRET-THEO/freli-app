/**
 * Webhook entrant Resend (via Svix) : événements email.opened / email.clicked.
 *
 * Alimente la table email_events, qui sert de base au moteur de règles des
 * relances intelligentes (smart-reminders-batch). Le rattachement email →
 * projet se fait via le resend_email_id enregistré au moment de l'envoi
 * (événement 'sent' inséré par send-project-invite).
 *
 * Configuration côté Resend : activer open/click tracking + créer un webhook
 * pointant vers cette fonction ; stocker le secret dans RESEND_WEBHOOK_SECRET.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

const EVENT_TYPE_MAP: Record<string, 'opened' | 'clicked'> = {
  'email.opened': 'opened',
  'email.clicked': 'clicked',
}

/** Vérification de signature Svix (HMAC-SHA256 sur "id.timestamp.body"). */
async function verifySvixSignature(req: Request, rawBody: string): Promise<boolean> {
  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) return false

  // Rejet des timestamps trop anciens (> 5 min) : anti-rejeu
  const timestampMs = Number(svixTimestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return false
  }

  const secretBase64 = webhookSecret.startsWith('whsec_')
    ? webhookSecret.slice('whsec_'.length)
    : webhookSecret
  const secretBytes = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const expected = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))

  // Le header peut contenir plusieurs signatures "v1,xxx v1,yyy"
  return svixSignature
    .split(' ')
    .map((part) => part.split(',')[1])
    .some((candidate) => candidate === expected)
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }
    if (!webhookSecret) {
      console.error('RESEND_WEBHOOK_SECRET non configuré')
      return new Response(JSON.stringify({ error: 'Webhook non configuré' }), { status: 500 })
    }

    const rawBody = await req.text()
    const valid = await verifySvixSignature(req, rawBody)
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
    }

    const payload = JSON.parse(rawBody) as {
      type?: string
      created_at?: string
      data?: { email_id?: string }
    }

    const eventType = EVENT_TYPE_MAP[payload.type ?? '']
    const resendEmailId = payload.data?.email_id
    if (!eventType || !resendEmailId) {
      // Événement non suivi (delivered, bounced…) : on répond 200 pour éviter les retries
      return new Response(JSON.stringify({ ignored: true }), { status: 200 })
    }

    // Rattachement au projet via l'événement 'sent' enregistré à l'envoi
    const { data: sentEvent } = await supabase
      .from('email_events')
      .select('project_id')
      .eq('resend_email_id', resendEmailId)
      .eq('event_type', 'sent')
      .maybeSingle()

    await supabase.from('email_events').insert({
      project_id: sentEvent?.project_id ?? null,
      resend_email_id: resendEmailId,
      event_type: eventType,
      occurred_at: payload.created_at ?? new Date().toISOString(),
    })

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error) {
    console.error('resend-events-webhook error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 400 })
  }
})
