import {
  buildChecklistItemConfig,
  buildChecklistItemValue,
  type DraftChecklistItem,
} from './checklist'
import { supabase } from './supabase'

export type SyncChecklistResult = {
  signatureItemId: string | null
}

export async function syncChecklistToProject(
  projectId: string,
  items: DraftChecklistItem[],
  _existingSignatureItemId?: string | null,
): Promise<SyncChecklistResult> {
  const aiDraftIndex = items.findIndex(
    (item) => item.type === 'signature' && item.contractSource === 'ai_generate',
  )

  const { error: deleteError } = await supabase
    .from('checklist_items')
    .delete()
    .eq('project_id', projectId)
  if (deleteError) throw new Error(deleteError.message)

  const payload = items.map((item, index) => ({
    project_id: projectId,
    label: item.label.trim(),
    type: item.type,
    required: true,
    order_index: index,
    completed: false,
    contract_template_id:
      item.type === 'signature' && item.contractSource === 'existing'
        ? item.contractTemplateId ?? null
        : null,
    value: buildChecklistItemValue(item),
    config: buildChecklistItemConfig(item, items),
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('checklist_items')
    .insert(payload)
    .select('id, order_index')

  if (insertError) throw new Error(insertError.message)

  const signatureRow =
    aiDraftIndex >= 0 ? inserted?.find((row) => row.order_index === aiDraftIndex) : null

  return { signatureItemId: signatureRow?.id ?? null }
}

export async function syncProjectPrice(projectId: string, priceEur: number | null): Promise<void> {
  const nextPrice = priceEur && priceEur > 0 ? priceEur : null

  const { data: project } = await supabase
    .from('projects')
    .select('price, stripe_checkout_session_id, payment_status')
    .eq('id', projectId)
    .maybeSingle()

  const priceChanged = (project?.price ?? null) !== nextPrice

  // Prefer expiring on Stripe while session_id is still on the row (agency JWT).
  // Any other PATCH to price still hits the DB trigger → queue + cron expire.
  if (
    priceChanged &&
    project?.stripe_checkout_session_id &&
    project.payment_status !== 'paid'
  ) {
    const { error: expireError } = await supabase.functions.invoke('stripe-payment-link', {
      body: { projectId, action: 'expire_checkout', sendEmail: false },
    })
    if (expireError) console.warn('expire checkout before price change:', expireError.message)
  }

  // Trigger BEFORE UPDATE OF price clears URL/session and queues expire if still present.
  const { error } = await supabase
    .from('projects')
    .update({ price: nextPrice })
    .eq('id', projectId)
  if (error) throw new Error(error.message)
}

export async function syncProjectPaymentSettings(
  projectId: string,
  settings: {
    paymentUnlockMode?: 'after_prerequisites' | 'immediate'
    amountType?: 'full' | 'deposit'
    depositPercent?: number | null
  },
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (settings.paymentUnlockMode) patch.payment_unlock_mode = settings.paymentUnlockMode
  if (settings.amountType) {
    patch.amount_type = settings.amountType
    patch.deposit_percent =
      settings.amountType === 'deposit' ? (settings.depositPercent ?? null) : null
  }
  if (Object.keys(patch).length === 0) return
  const { error } = await supabase.from('projects').update(patch).eq('id', projectId)
  if (error) throw new Error(error.message)
}
