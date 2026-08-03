const STORAGE_KEY = 'freli_recent_projects'
const MAX_RECENTS = 5

export type RecentProject = {
  id: string
  name: string
  visitedAt: number
}

function readRaw(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is RecentProject =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as RecentProject).id === 'string' &&
          typeof (item as RecentProject).name === 'string' &&
          typeof (item as RecentProject).visitedAt === 'number',
      )
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

export function getRecentProjects(): RecentProject[] {
  if (typeof localStorage === 'undefined') return []
  return readRaw()
}

export function pushRecentProject(id: string, name: string): void {
  if (typeof localStorage === 'undefined' || !id) return
  const next: RecentProject[] = [
    { id, name: name.trim() || 'Projet', visitedAt: Date.now() },
    ...readRaw().filter((item) => item.id !== id),
  ].slice(0, MAX_RECENTS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('freli:recents-updated'))
}
