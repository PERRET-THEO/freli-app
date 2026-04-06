import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

serve(async (req) => {
  try {
    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    console.log('Function called with:', JSON.stringify(body))

    const thresholdDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, created_at, status, last_reminder_sent_at')
      .neq('status', 'completed')
      .lt('created_at', thresholdDate)
      .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${thresholdDate}`)

    if (error) {
      throw new Error(error.message)
    }

    const results: unknown[] = []
    for (const project of projects ?? []) {
      const invokeResult = await supabase.functions.invoke('send-project-invite', {
        body: { projectId: project.id, reminder: true },
      })
      results.push({ projectId: project.id, ...invokeResult })
    }
    console.log('Resend response:', JSON.stringify(results))

    return new Response(JSON.stringify({ success: true, count: projects?.length ?? 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
