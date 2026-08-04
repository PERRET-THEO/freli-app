import { supabase } from './supabase'
import {
  buildChecklistItemConfig,
  createDraftItem,
  readChecklistItemConfig,
  type ChecklistItemType,
  type DraftChecklistItem,
} from './checklist'
import { resolveDraftConditions } from './checklistConditions'
import type { ChecklistItemConfig } from './checklistFields'

export type AgencyChecklistTemplate = {
  id: string
  name: string
  description: string | null
  itemCount: number
  created_at: string
}

type TemplateItemRow = {
  id: string
  label: string
  type: ChecklistItemType
  order_index: number
  contract_template_id: string | null
  config: ChecklistItemConfig | null
}

export async function listAgencyChecklistTemplates(
  agencyId: string,
): Promise<AgencyChecklistTemplate[]> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('id, name, description, created_at, checklist_template_items(count)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('listAgencyChecklistTemplates:', error.message)
    return []
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const counts = row.checklist_template_items as { count: number }[] | undefined
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      itemCount: counts?.[0]?.count ?? 0,
      created_at: row.created_at as string,
    }
  })
}

export async function loadChecklistTemplateItems(
  templateId: string,
): Promise<DraftChecklistItem[]> {
  const { data, error } = await supabase
    .from('checklist_template_items')
    .select('id, label, type, order_index, contract_template_id, config')
    .eq('template_id', templateId)
    .order('order_index', { ascending: true })

  if (error) {
    console.warn('loadChecklistTemplateItems:', error.message)
    return []
  }

  const rows = (data ?? []) as TemplateItemRow[]

  const drafts = rows.map((row) =>
    createDraftItem(row.label, row.type, {
      contractSource:
        row.type === 'signature'
          ? row.contract_template_id
            ? 'existing'
            : 'default'
          : undefined,
      contractTemplateId: row.contract_template_id,
      ...readChecklistItemConfig(row.type, row.config),
    }),
  )

  // Les conditions référencent une position : elles ne se résolvent qu'une fois
  // tous les brouillons créés (et donc leurs nouveaux identifiants connus).
  return resolveDraftConditions(
    drafts,
    rows.map((row) => row.config),
  )
}

async function replaceTemplateItems(templateId: string, items: DraftChecklistItem[]) {
  await supabase.from('checklist_template_items').delete().eq('template_id', templateId)
  if (!items.length) return
  const payload = items.map((item, index) => ({
    template_id: templateId,
    label: item.label.trim(),
    type: item.type,
    order_index: index,
    contract_template_id: item.type === 'signature' ? item.contractTemplateId ?? null : null,
    config: buildChecklistItemConfig(item, items),
  }))
  const { error } = await supabase.from('checklist_template_items').insert(payload)
  if (error) throw new Error(error.message)
}

export async function saveChecklistTemplate(
  agencyId: string,
  name: string,
  items: DraftChecklistItem[],
  description?: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .insert({ agency_id: agencyId, name: name.trim(), description: description?.trim() || null })
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Impossible de créer le modèle.')
  }

  await replaceTemplateItems(data.id, items)
  return data.id
}

export async function updateChecklistTemplate(
  templateId: string,
  name: string,
  items: DraftChecklistItem[],
  description?: string,
): Promise<void> {
  const { error } = await supabase
    .from('checklist_templates')
    .update({
      name: name.trim(),
      description: description?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)

  if (error) throw new Error(error.message)
  await replaceTemplateItems(templateId, items)
}

export async function deleteChecklistTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.from('checklist_templates').delete().eq('id', templateId)
  if (error) throw new Error(error.message)
}
