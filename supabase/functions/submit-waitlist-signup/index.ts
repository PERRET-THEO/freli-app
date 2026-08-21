import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { getResendFrom, assertResendOk, isDevMode } from '../_shared/email.ts'
import { buildWaitlistConfirmationEmail } from '../_shared/clientEmailHtml.ts'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'
import {
  WAITLIST_CONSENT_TEXT_VERSION,
  isHoneypotFilled,
  isValidUnsubscribeToken,
  parseWaitlistSignupBody,
} from '../_shared/waitlistSignup.ts'

type WaitlistRow = {
  id: string
  first_name: string
  email: string
  unsubscribed_at: string | null
  unsubscribe_token: string
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const marketingUrl = (Deno.env.get('MARKETING_URL') ?? 'https://www.freli.fr').replace(/\/$/, '')
const launchUrl = (Deno.env.get('LAUNCH_URL') ?? 'https://lancement.freli.fr').replace(/\/$/, '')

const supabase = createClient(supabaseUrl, serviceRoleKey)
const resend = new Resend(resendApiKey)

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX = 5
const ipHits = new Map<string, number[]>()

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (ipHits.get(ip) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX) {
    ipHits.set(ip, recent)
    return true
  }
  recent.push(now)
  ipHits.set(ip, recent)
  return false
}

function hasJsonContentType(req: Request): boolean {
  const value = req.headers.get('content-type') ?? ''
  return value.toLowerCase().includes('application/json')
}

function unsubscribePageUrl(token: string): string {
  return `${launchUrl}/desinscription?token=${encodeURIComponent(token)}`
}

async function sendConfirmation(row: WaitlistRow): Promise<void> {
  const unsubscribeUrl = unsubscribePageUrl(row.unsubscribe_token)
  if (isDevMode()) {
    console.log('MODE DEV — Email waitlist simulé pour:', row.email, unsubscribeUrl)
    return
  }
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  const html = buildWaitlistConfirmationEmail({
    firstName: row.first_name,
    unsubscribeUrl,
    siteUrl: marketingUrl,
  })
  const result = await resend.emails.send({
    from: getResendFrom(),
    to: row.email,
    subject: `C’est noté, ${row.first_name} !`,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
    },
  })
  assertResendOk(result)
}

async function handleUnsubscribe(token: string): Promise<Response> {
  if (!isValidUnsubscribeToken(token)) {
    return jsonResponse({ error: 'Lien de désinscription invalide' }, 400)
  }

  const { data, error } = await supabase
    .from('waitlist_signups')
    .select('id, unsubscribed_at')
    .eq('unsubscribe_token', token.trim())
    .maybeSingle()

  if (error) {
    console.error('waitlist unsubscribe lookup:', error.message)
    return jsonResponse({ error: 'Impossible de traiter la désinscription' }, 500)
  }
  if (!data) {
    return jsonResponse({ ok: true, unsubscribed: true })
  }
  if (!data.unsubscribed_at) {
    const { error: updateError } = await supabase
      .from('waitlist_signups')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', data.id)
    if (updateError) {
      console.error('waitlist unsubscribe update:', updateError.message)
      return jsonResponse({ error: 'Impossible de traiter la désinscription' }, 500)
    }
  }
  return jsonResponse({ ok: true, unsubscribed: true })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!hasJsonContentType(req)) {
    return jsonResponse({ error: 'Content-Type invalide' }, 415)
  }

  try {
    let body: Record<string, unknown>
    try {
      const raw = await req.text()
      if (!raw || raw.trim() === '') return jsonResponse({ error: 'Body vide reçu' }, 400)
      body = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return jsonResponse({ error: 'JSON invalide' }, 400)
    }

    if (body.action === 'unsubscribe') {
      const token = typeof body.token === 'string' ? body.token : ''
      return await handleUnsubscribe(token)
    }

    if (isRateLimited(clientIp(req))) {
      return jsonResponse({ error: 'Trop de tentatives, réessayez dans quelques minutes' }, 429)
    }

    if (isHoneypotFilled(body.website)) {
      return jsonResponse({ ok: true, alreadyRegistered: false })
    }

    const parsed = parseWaitlistSignupBody(body)
    if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400)

    const { data: existing, error: lookupError } = await supabase
      .from('waitlist_signups')
      .select('id, first_name, email, unsubscribed_at, unsubscribe_token')
      .eq('email', parsed.email)
      .maybeSingle()

    if (lookupError) {
      console.error('waitlist lookup:', lookupError.message)
      return jsonResponse({ error: 'Impossible d’enregistrer l’inscription' }, 500)
    }

    if (existing) {
      if (existing.unsubscribed_at) {
        const { data: restored, error: restoreError } = await supabase
          .from('waitlist_signups')
          .update({
            first_name: parsed.firstName,
            consent_at: new Date().toISOString(),
            consent_text_version: WAITLIST_CONSENT_TEXT_VERSION,
            unsubscribed_at: null,
            source: 'lancement.freli.fr',
          })
          .eq('id', existing.id)
          .select('id, first_name, email, unsubscribed_at, unsubscribe_token')
          .single()
        if (restoreError || !restored) {
          console.error('waitlist restore:', restoreError?.message)
          return jsonResponse({ error: 'Impossible d’enregistrer l’inscription' }, 500)
        }
        try {
          await sendConfirmation(restored as WaitlistRow)
        } catch (emailError) {
          console.error('waitlist email:', (emailError as Error).message)
        }
        return jsonResponse({ ok: true, alreadyRegistered: false })
      }
      return jsonResponse({ ok: true, alreadyRegistered: true })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('waitlist_signups')
      .insert({
        first_name: parsed.firstName,
        email: parsed.email,
        source: 'lancement.freli.fr',
        consent_at: new Date().toISOString(),
        consent_text_version: WAITLIST_CONSENT_TEXT_VERSION,
      })
      .select('id, first_name, email, unsubscribed_at, unsubscribe_token')
      .single()

    if (insertError || !inserted) {
      if (insertError?.code === '23505') {
        return jsonResponse({ ok: true, alreadyRegistered: true })
      }
      console.error('waitlist insert:', insertError?.message)
      return jsonResponse({ error: 'Impossible d’enregistrer l’inscription' }, 500)
    }

    try {
      await sendConfirmation(inserted as WaitlistRow)
    } catch (emailError) {
      console.error('waitlist email:', (emailError as Error).message)
    }

    return jsonResponse({ ok: true, alreadyRegistered: false })
  } catch (error) {
    console.error('submit-waitlist-signup:', (error as Error).message)
    return jsonResponse({ error: 'Impossible d’enregistrer l’inscription' }, 500)
  }
})
