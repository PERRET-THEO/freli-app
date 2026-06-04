import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

serve(async (req) => {
  try {
    // Le batch n'est appelé que par le cron : on exige un secret partagé.
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: 'CRON_SECRET non configuré' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (req.headers.get('x-cron-secret') !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

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

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const project of projects ?? []) {
      // Ne pas relancer si la checklist est déjà entièrement complétée.
      const { count: pendingCount } = await supabase
        .from('checklist_items')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('completed', false)

      if ((pendingCount ?? 0) === 0) {
        skipped += 1
        continue
      }

      try {
        const invokeResult = await supabase.functions.invoke('send-project-invite', {
          body: { projectId: project.id, reminder: true, source: 'auto' },
        })
        const payload = invokeResult.data as { error?: string; success?: boolean } | null
        if (invokeResult.error || payload?.error || !payload?.success) {
          console.error('Reminder failed for', project.id, invokeResult.error?.message ?? payload?.error)
          failed += 1
        } else {
          sent += 1
        }
      } catch (invokeError) {
        console.error('Reminder failed for', project.id, (invokeError as Error).message)
        failed += 1
      }
    }

    const summary = { success: true, candidates: projects?.length ?? 0, sent, skipped, failed }
    console.log('Batch summary:', JSON.stringify(summary))

    return new Response(JSON.stringify(summary), {
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
