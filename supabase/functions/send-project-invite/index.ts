import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'

// @ts-ignore
// Deno.serve pas nécessaire — garder serve()

type InviteBody = {
  projectId?: string
  token?: string
  clientName?: string
  clientEmail?: string
  agencyName?: string
  reminder?: boolean
  mode?: 'reminder' | 'invite'
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

const supabase = createClient(supabaseUrl, serviceRoleKey)
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

  try {
    let body: InviteBody
    try {
      const rawBody = await req.text()
      console.log('Raw body reçu:', rawBody)
      if (!rawBody || rawBody.trim() === '') {
        return new Response(JSON.stringify({ error: 'Body vide reçu' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      body = JSON.parse(rawBody) as InviteBody
      console.log('Body parsé:', JSON.stringify(body))
    } catch (e) {
      const parseMessage = e instanceof Error ? e.message : String(e)
      console.error('Erreur parsing JSON:', parseMessage)
      return new Response(JSON.stringify({ error: `JSON invalide: ${parseMessage}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Function called with:', JSON.stringify(body))
    const isDev = Deno.env.get('APP_URL')?.includes('localhost') ?? true

    if (isDev) {
      console.log('MODE DEV — Email simulé pour:', body.clientEmail)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email simulé en développement',
          recipient: body.clientEmail,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let projectId = body.projectId
    let token = body.token
    let clientName = body.clientName
    let clientEmail = body.clientEmail
    let agencyName = body.agencyName ?? 'Mon Agence'
    const isReminderMode = body.mode === 'reminder' || body.reminder === true

    if (projectId && (!clientEmail || !token || !clientName)) {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('id, token, client_name, client_email, agency_id, agencies(name)')
        .eq('id', projectId)
        .single()
      if (projectError || !projectData) throw new Error('Project not found')
      token = projectData.token
      clientName = projectData.client_name
      clientEmail = projectData.client_email
      const agenciesRel = projectData.agencies as { name?: string } | { name?: string }[] | null
      const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
      agencyName = agencyRow?.name ?? agencyName
    }

    if (!token || !clientName || !clientEmail) {
      throw new Error('Missing invite payload')
    }

    const portalUrl = `${appUrl}/p/${token}`
    const subject = isReminderMode
      ? `${agencyName} — rappel onboarding`
      : `${agencyName} vous invite à compléter votre onboarding`

    const result = await resend.emails.send({
      from: 'Freli <onboarding@resend.dev>',
      to: clientEmail,
      subject,
      html: `
        <div style="font-family: DM Sans, Arial, sans-serif; background:#F5F4F0; padding:32px;">
          <div style="max-width:560px; margin:0 auto; background:#FDFCFA; border-radius:16px; padding:28px;">
            <div style="font-family: Syne, Arial, sans-serif; font-weight:800; font-size:24px; color:#0D0F14;">Freli</div>
            <p style="margin-top:20px; color:#1C1F2A;">Bonjour ${clientName},</p>
            <p style="color:#1C1F2A;">${agencyName} vous a préparé un espace d'onboarding.</p>
            <a href="${portalUrl}" style="display:inline-block; margin-top:16px; padding:12px 20px; background:#5B6EF5; color:#fff; border-radius:8px; text-decoration:none; font-weight:600;">
              Accéder à mon espace
            </a>
            <p style="margin-top:28px; color:#6B7080; font-size:12px;">Propulsé par Freli</p>
          </div>
        </div>
      `,
    })
    console.log('Resend response:', JSON.stringify(result))

    if (isReminderMode && projectId) {
      await supabase
        .from('projects')
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq('id', projectId)
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
