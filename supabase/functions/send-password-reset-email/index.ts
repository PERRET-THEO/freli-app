import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { getAuthResendFrom, assertResendOk, isDevMode } from '../_shared/email.ts'
import { buildPasswordResetEmail } from '../_shared/clientEmailHtml.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const resend = new Resend(resendApiKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = (await req.json()) as { email?: string }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const redirectTo = `${appUrl}/reset-password`

    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })

    if (linkError) {
      console.log('password reset skipped:', linkError.message)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const actionLink =
      data?.properties?.action_link ??
      (data as { action_link?: string } | null)?.action_link ??
      null

    if (!actionLink) {
      console.log('password reset skipped: no action link')
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (isDevMode()) {
      console.log('MODE DEV — Email reset simulé pour:', email, actionLink)
      return new Response(JSON.stringify({ ok: true, message: 'Email simulé' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured')
    }

    const html = buildPasswordResetEmail({ resetUrl: actionLink })
    const result = await resend.emails.send({
      from: getAuthResendFrom(),
      to: email,
      subject: 'Freli — réinitialisez votre mot de passe',
      html,
    })
    assertResendOk(result)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = (error as Error).message
    console.error('send-password-reset-email error:', message)
    const friendly =
      message.includes('only send testing emails') || message.includes('validation')
        ? 'Envoi email impossible : vérifiez la configuration Resend (domaine ou destinataire autorisé).'
        : 'Impossible d’envoyer l’email de réinitialisation.'
    return new Response(JSON.stringify({ error: friendly }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
