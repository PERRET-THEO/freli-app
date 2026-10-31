import { formatBottleneckLabel, findProjectBottleneck, type BottleneckItem } from './projectBottleneck'
import { getReviewStatus } from './checklistReview'
import { formatEuro } from './formatEuro'
import { supabase } from './supabase'

export type ClientPreviewExtras = {
  priceLabel: string | null
  nextActionLabel: string | null
}

/**
 * Projet non terminé le plus récent du client : montant + prochaine action (bottleneck).
 */
export async function fetchClientPreviewExtras(clientId: string): Promise<ClientPreviewExtras> {
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, price, created_at, status')
    .eq('client_id', clientId)
    .neq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !project) {
    return { priceLabel: null, nextActionLabel: null }
  }

  const priceLabel =
    project.price != null && Number(project.price) > 0 ? formatEuro(Number(project.price)) : null

  const { data: items } = await supabase
    .from('checklist_items')
    .select(
      'label, type, completed, value, order_index, review_status, submitted_at, reviewed_at, config',
    )
    .eq('project_id', project.id)
    .order('order_index', { ascending: true })

  const bottleneckItems: BottleneckItem[] = (items ?? []).map((row) => ({
    label: row.label,
    type: row.type,
    completed: Boolean(row.completed),
    value: row.value,
    order_index: row.order_index,
    review_status: getReviewStatus(row),
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    config: row.config as BottleneckItem['config'],
  }))

  const bottleneck = findProjectBottleneck(bottleneckItems, project.created_at)
  return {
    priceLabel,
    nextActionLabel: bottleneck ? formatBottleneckLabel(bottleneck) : null,
  }
}
