/**
 * Charge les signaux projet et calcule la catégorie comportementale.
 * Utilisé par smart-reminders-batch et request-smart-reminder.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  categorizeClientBehavior,
  type BehaviorResult,
} from './smartReminderBehavior.ts'

export async function resolveProjectBehavior(
  supabase: SupabaseClient,
  project: {
    id: string
    last_portal_visit_at: string | null
  },
): Promise<BehaviorResult & { items: Array<{ label: string; completed: boolean }> }> {
  const { data: itemRows } = await supabase
    .from('checklist_items')
    .select('label, completed, order_index')
    .eq('project_id', project.id)
    .order('order_index', { ascending: true })

  const items = (itemRows ?? []).map((row) => ({
    label: String(row.label ?? ''),
    completed: row.completed === true,
  }))

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
    emailEvents: {
      opened: openedCount ?? 0,
      clicked: clickedCount ?? 0,
    },
  })

  return { ...result, items }
}
