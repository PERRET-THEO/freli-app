/**
 * Claim / finalize des relances auto via RPC Postgres (anti-doublon).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type ClaimResult =
  | { ok: true; logId: string }
  | { ok: false; errorCode: string }

type ClaimRow = {
  ok: boolean
  log_id: string | null
  error_code: string | null
}

export async function claimAutoReminder(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_auto_reminder', {
    p_project_id: projectId,
  })
  if (error) {
    return { ok: false, errorCode: error.message }
  }
  const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | null
  if (!row || row.ok !== true || !row.log_id) {
    return { ok: false, errorCode: row?.error_code ?? 'claim_failed' }
  }
  return { ok: true, logId: row.log_id }
}

export async function finalizeAutoReminder(
  supabase: SupabaseClient,
  logId: string,
  status: 'sent' | 'failed',
): Promise<boolean> {
  const { data, error } = await supabase.rpc('finalize_auto_reminder', {
    p_log_id: logId,
    p_status: status,
  })
  if (error) {
    console.error('finalize_auto_reminder failed', logId, error.message)
    return false
  }
  return data === true
}
