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
  const { error } = await supabase
    .from('projects')
    .update({ price: priceEur && priceEur > 0 ? priceEur : null })
    .eq('id', projectId)
  if (error) throw new Error(error.message)
}
