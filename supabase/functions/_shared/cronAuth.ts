/**
 * Authentification des appels cron (GitHub Actions ou pg_cron).
 * Accepte x-cron-secret = CRON_SECRET (env) ou = app_internal_secrets.cron_shared
 * (secret lu par pg_cron / pg_net, comme expire-stale-checkouts).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function isCronAuthorized(req: Request, supabase: SupabaseClient): Promise<boolean> {
  const header = req.headers.get('x-cron-secret') ?? ''
  if (!header) return false
  const envSecret = Deno.env.get('CRON_SECRET') ?? ''
  if (envSecret && header === envSecret) return true
  const { data } = await supabase
    .from('app_internal_secrets')
    .select('value')
    .eq('key', 'cron_shared')
    .maybeSingle()
  return Boolean(data?.value && data.value === header)
}
