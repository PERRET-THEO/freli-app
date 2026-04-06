import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

const supabase = createClient(supabaseUrl, serviceRoleKey)
const resend = new Resend(resendApiKey)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    console.log('=== send-project-completed-notification START ===')
    const rawBody = await req.text()
    console.log('Raw body length:', rawBody.length)

    if (!rawBody || rawBody.trim() === '') {
      return new Response(JSON.stringify({ error: 'Body vide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = JSON.parse(rawBody) as { projectId?: string }
    console.log('projectId:', body.projectId)

    if (!body.projectId) {
      return new Response(JSON.stringify({ error: 'Missing projectId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isDev = appUrl.includes('localhost')
    if (isDev) {
      console.log('MODE DEV — Email de notification simulé')
      return new Response(
        JSON.stringify({ success: true, message: 'Email simulé en développement' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('id, client_name, agency_id')
      .eq('id', body.projectId)
      .single()
    if (projectError || !projectData) throw new Error('Project not found')
    console.log('Project found:', projectData.client_name)

    const { data: agencyData, error: agencyError } = await supabase
      .from('agencies')
      .select('name, user_id')
      .eq('id', projectData.agency_id)
      .single()
    if (agencyError || !agencyData) throw new Error('Agency not found')

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      agencyData.user_id,
    )
    if (userError || !userData.user?.email) throw new Error('Agency user email not found')
    console.log('Sending notification to:', userData.user.email)

    const { data: itemsData } = await supabase
      .from('checklist_items')
      .select('label, completed')
      .eq('project_id', projectData.id)
      .order('order_index', { ascending: true })

    const listHtml = (itemsData ?? [])
      .map((item) => `<li>${item.completed ? '✅' : '⬜'} ${item.label}</li>`)
      .join('')

    const result = await resend.emails.send({
      from: 'Freli <onboarding@resend.dev>',
      to: userData.user.email,
      subject: `✅ ${projectData.client_name} a complété son onboarding`,
      html: `
        <div style="font-family: DM Sans, Arial, sans-serif; background:#F5F4F0; padding:32px;">
          <div style="max-width:620px; margin:0 auto; background:#FDFCFA; border-radius:16px; padding:28px;">
            <h2 style="font-family: Syne, Arial, sans-serif; margin:0 0 12px;">Onboarding complété</h2>
            <p>${projectData.client_name} a terminé son onboarding.</p>
            <ul>${listHtml}</ul>
            <a href="${appUrl}/dashboard/project/${projectData.id}" style="display:inline-block; margin-top:12px; padding:12px 20px; background:#5B6EF5; color:#fff; border-radius:8px; text-decoration:none;">
              Voir le projet
            </a>
          </div>
        </div>
      `,
    })
    console.log('Resend response:', JSON.stringify(result))

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('send-project-completed-notification error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
