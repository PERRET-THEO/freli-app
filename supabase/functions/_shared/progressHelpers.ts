import { isItemVisible, type VisibilityItem } from './checklistVisibility.ts'

export function getVisibleProgressCounts<T extends VisibilityItem & { completed: boolean }>(
  items: T[],
): { completed: number; total: number; percent: number } {
  const ordered = [...items]
  const visible = ordered.filter((item) => isItemVisible(item, ordered))
  const total = visible.length
  const completed = visible.filter((item) => item.completed).length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  return { completed, total, percent }
}
