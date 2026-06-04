import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { getResendFrom, assertResendOk } from '../_shared/email.ts'
import { buildClientPaymentEmail } from '../_shared/clientEmailHtml.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

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
    const rawBody = await req.text()
    if (!rawBody || rawBody.trim() === '') {
      return new Response(JSON.stringify({ error: 'Body vide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = JSON.parse(rawBody) as { projectId?: string }
    if (!body.projectId) {
      return new Response(JSON.stringify({ error: 'Missing projectId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, client_name, client_email, price, payment_status, stripe_checkout_url, agencies(name)')
      .eq('id', body.projectId)
      .single()
    if (projectError || !project) throw new Error('Project not found')

    if (project.payment_status === 'paid') {
      return new Response(JSON.stringify({ skipped: 'already paid' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!project.stripe_checkout_url) throw new Error('No checkout URL available')
    if (!project.client_email) throw new Error('No client email')

    const agenciesRel = project.agencies as { name?: string } | { name?: string }[] | null
    const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
    const agencyName = agencyRow?.name ?? 'Mon Agence'

    if (appUrl.includes('localhost')) {
      console.log('MODE DEV — Email paiement simulé pour:', project.client_email)
      return new Response(JSON.stringify({ success: true, message: 'Email simulé' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = buildClientPaymentEmail({
      clientName: project.client_name,
      agencyName,
      checkoutUrl: project.stripe_checkout_url,
      amountLabel: `${project.price} €`,
    })

    const result = await resend.emails.send({
      from: getResendFrom(),
      to: project.client_email,
      subject: `${agencyName} — finalisez votre paiement`,
      html,
    })
    console.log('Resend response:', JSON.stringify(result))
    assertResendOk(result)

    await supabase
      .from('projects')
      .update({ last_payment_email_sent_at: new Date().toISOString() })
      .eq('id', project.id)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-payment-link-email error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
