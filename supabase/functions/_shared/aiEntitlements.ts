/**
 * Gate add-on IA + consommation de crédits (1 crédit = 1 opération métier).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AiFeature = 'extraction' | 'reminders' | 'contracts'

const CONSUME_REASON: Record<AiFeature, string> = {
  extraction: 'consume_extraction',
  reminders: 'consume_reminder',
  contracts: 'consume_contract',
}

export async function isAiAddonActive(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('billing_accounts')
    .select('ai_addon_active')
    .eq('agency_id', agencyId)
    .maybeSingle()
  return data?.ai_addon_active === true
}

/** Refuse si add-on inactif. Retourne un corps JSON prêt pour jsonResponse. */
export async function assertAiAddonActive(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<{ error: string; status: number; code: string } | null> {
  if (await isAiAddonActive(supabase, agencyId)) return null
  return {
    error: 'Add-on Modules IA requis. Activez-le depuis la page tarifs.',
    status: 402,
    code: 'ai_addon_required',
  }
}

export type ConsumeCreditResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; code: 'addon_inactive' | 'insufficient_credits' | 'error'; message: string; status: number }

export async function consumeAiCredit(
  supabase: SupabaseClient,
  args: {
    agencyId: string
    feature: AiFeature
    refId?: string | null
    amount?: number
    /** analyze-contract-model utilise consume_analyze_model */
    reasonOverride?: string
  },
): Promise<ConsumeCreditResult> {
  const reason = args.reasonOverride ?? CONSUME_REASON[args.feature]
  const { data, error } = await supabase.rpc('consume_ai_credit', {
    p_agency_id: args.agencyId,
    p_reason: reason,
    p_feature: args.feature,
    p_ref_id: args.refId ?? null,
    p_amount: args.amount ?? 1,
  })

  if (error) {
    console.error('consume_ai_credit rpc:', error.message)
    return { ok: false, code: 'error', message: error.message, status: 500 }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || row.ok !== true) {
    const code = (row?.error_code as string) ?? 'insufficient_credits'
    if (code === 'addon_inactive') {
      return {
        ok: false,
        code: 'addon_inactive',
        message: 'Add-on Modules IA requis.',
        status: 402,
      }
    }
    return {
      ok: false,
      code: 'insufficient_credits',
      message: 'Crédits IA insuffisants pour ce mois.',
      status: 402,
    }
  }

  return { ok: true, balanceAfter: Number(row.balance_after ?? 0) }
}

export async function ensureMonthlyCredits(
  supabase: SupabaseClient,
  agencyId: string,
  credits = 50,
): Promise<void> {
  const { error } = await supabase.rpc('ensure_ai_monthly_credits', {
    p_agency_id: agencyId,
    p_credits: credits,
  })
  if (error) console.warn('ensure_ai_monthly_credits:', error.message)
}
