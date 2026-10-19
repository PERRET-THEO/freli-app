/**
 * Charge les signaux projet et calcule la catégorie comportementale.
 * Utilisé par smart-reminders-batch et request-smart-reminder.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getClientPendingActions } from './clientPendingActions.ts'
import { getBlockingStep, type BottleneckItem } from './projectBottleneck.ts'
import { getVisibleProgressCounts } from './progressHelpers.ts'
import {
  categorizeClientBehavior,
  type BehaviorResult,
} from './smartReminderBehavior.ts'
import type { ReviewStatus } from './checklistReview.ts'

type ItemRow = {
  label: string
  type: string
  completed: boolean
  value: string | null
  order_index: number
  review_status: ReviewStatus | null
  review_note?: string | null
  submitted_at?: string | null
  reviewed_at?: string | null
  config?: { visibleWhen?: unknown } | null
}

export type ResolvedBehavior = BehaviorResult & {
  items: ItemRow[]
  clientActionLabels: string[]
  corrections: Array<{ label: string; note: string }>
  progress: { completedVisible: number; totalVisible: number; percent: number }
  blockingStep: ReturnType<typeof getBlockingStep>
}

export async function resolveProjectBehavior(
  supabase: SupabaseClient,
  project: {
    id: string
    last_portal_visit_at: string | null
    created_at?: string
    items?: ItemRow[]
  },
): Promise<ResolvedBehavior> {
  let itemRows = project.items
  if (!itemRows) {
    const { data } = await supabase
      .from('checklist_items')
      .select(
        'label, type, completed, value, order_index, review_status, review_note, submitted_at, reviewed_at, config',
      )
      .eq('project_id', project.id)
      .order('order_index', { ascending: true })
    itemRows = (data ?? []) as ItemRow[]
  }

  const items = itemRows.map((row) => ({
    label: String(row.label ?? ''),
    type: String(row.type ?? 'text'),
    completed: row.completed === true,
    value: row.value ?? null,
    order_index: typeof row.order_index === 'number' ? row.order_index : 0,
    review_status: row.review_status ?? null,
    review_note: row.review_note ?? null,
    submitted_at: row.submitted_at ?? null,
    reviewed_at: row.reviewed_at ?? null,
    config: row.config ?? null,
  }))

  const clientActions = getClientPendingActions(items)
  const clientActionLabels = clientActions.map((item) => item.label)
  const corrections = clientActions
    .filter((item) => item.review_status === 'rejected' && String(item.review_note ?? '').trim())
    .map((item) => ({
      label: item.label,
      note: String(item.review_note).trim(),
    }))

  const bottleneckItems: BottleneckItem[] = items
  const blockingStep = project.created_at
    ? getBlockingStep(bottleneckItems, project.created_at)
    : null

  const progressCounts = getVisibleProgressCounts(items)

  const { count: openedCount } = await supabase
    .from('email_events')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id)
    .eq('event_type', 'opened')

  const { count: clickedCount } = await supabase
    .from('email_events')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id)
    .eq('event_type', 'clicked')

  const result = categorizeClientBehavior({
    lastPortalVisitAt: project.last_portal_visit_at,
    items,
    clientActionLabels,
    emailEvents: {
      opened: openedCount ?? 0,
      clicked: clickedCount ?? 0,
    },
  })

  return {
    ...result,
    items,
    clientActionLabels,
    corrections,
    progress: {
      completedVisible: progressCounts.completed,
      totalVisible: progressCounts.total,
      percent: progressCounts.percent,
    },
    blockingStep,
  }
}
