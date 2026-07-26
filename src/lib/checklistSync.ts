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
  existingSignatureItemId?: string | null,
): Promise<SyncChecklistResult> {
  const { data: existing, error: fetchError } = await supabase
    .from('checklist_items')
    .select('id, label, type, order_index')
    .eq('project_id', projectId)
    .order('order_index', { ascending: true })

  if (fetchError) throw new Error(fetchError.message)

  const aiDraftIndex = items.findIndex(
    (item) => item.type === 'signature' && item.contractSource === 'ai_generate',
  )
  const aiDraftItem = aiDraftIndex >= 0 ? items[aiDraftIndex] : null

  let preservedSignatureId: string | null = null
  if (aiDraftItem && existingSignatureItemId) {
    const existingAtIndex = existing?.find((row) => row.order_index === aiDraftIndex)
    if (
      existingAtIndex?.id === existingSignatureItemId &&
      existingAtIndex.type === 'signature' &&
      existingAtIndex.label.trim() === aiDraftItem.label.trim()
    ) {
      preservedSignatureId = existingSignatureItemId
    }
  }

  const { error: deleteError } = await supabase
    .from('checklist_items')
    .delete()
    .eq('project_id', projectId)
  if (deleteError) throw new Error(deleteError.message)

  const payload = items.map((item, index) => {
    const row: Record<string, unknown> = {
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
    }
    if (
      preservedSignatureId &&
      index === aiDraftIndex &&
      item.type === 'signature' &&
      item.contractSource === 'ai_generate'
    ) {
      row.id = preservedSignatureId
    }
    return row
  })

  const { data: inserted, error: insertError } = await supabase
    .from('checklist_items')
    .insert(payload)
    .select('id, order_index')

  if (insertError) throw new Error(insertError.message)

  const signatureRow =
    aiDraftIndex >= 0 ? inserted?.find((row) => row.order_index === aiDraftIndex) : null

  return { signatureItemId: signatureRow?.id ?? preservedSignatureId ?? null }
}

export async function syncProjectPrice(projectId: string, priceEur: number | null): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ price: priceEur && priceEur > 0 ? priceEur : null })
    .eq('id', projectId)
  if (error) throw new Error(error.message)
}
