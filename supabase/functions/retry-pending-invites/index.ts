import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

const STALE_MINUTES = 5
const MAX_ATTEMPTS = 2

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!cronSecret) {
      return jsonResponse({ error: 'CRON_SECRET non configuré' }, 500)
    }
    if (req.headers.get('x-cron-secret') !== cronSecret) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()

    const { data: stuck, error } = await supabase
      .from('projects')
      .select('id, invite_attempts, created_at, invite_last_attempt_at')
      .eq('invite_status', 'pending')
      .lt('created_at', staleBefore)
      .lt('invite_attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(40)

    if (error) throw new Error(error.message)

    const results: { id: string; action: string }[] = []

    for (const row of stuck ?? []) {
      const attempts = Number(row.invite_attempts ?? 0)
      if (attempts >= MAX_ATTEMPTS) {
        await supabase
          .from('projects')
          .update({
            invite_status: 'failed',
            invite_error: 'Échec après 2 tentatives automatiques',
          })
          .eq('id', row.id)
        results.push({ id: row.id, action: 'marked_failed_max_attempts' })
        continue
      }

      const lastAttempt = row.invite_last_attempt_at
        ? new Date(row.invite_last_attempt_at).getTime()
        : 0
      if (lastAttempt && Date.now() - lastAttempt < STALE_MINUTES * 60_000) {
        continue
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/send-project-invite`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({ projectId: row.id, mode: 'invite', force: true }),
      })

      results.push({
        id: row.id,
        action: res.status === 202 || res.ok ? 'retried' : `http_${res.status}`,
      })
    }

    // Mark permanently failed if still pending after max attempts
    const { data: exhausted } = await supabase
      .from('projects')
      .select('id')
      .eq('invite_status', 'pending')
      .gte('invite_attempts', MAX_ATTEMPTS)
      .lt('created_at', staleBefore)
      .limit(40)

    for (const row of exhausted ?? []) {
      await supabase
        .from('projects')
        .update({
          invite_status: 'failed',
          invite_error: 'Échec après 2 tentatives automatiques',
        })
        .eq('id', row.id)
        .eq('invite_status', 'pending')
      results.push({ id: row.id, action: 'marked_failed_exhausted' })
    }

    return jsonResponse({ ok: true, processed: results.length, results })
  } catch (err) {
    console.error(err)
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
