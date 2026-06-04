/** Formate une date ISO en libellé relatif court en français (ex. "il y a 3 j"). */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return ''
  const diff = now - new Date(iso).getTime()
  if (diff < 0) return "à l'instant"
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} j`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `il y a ${weeks} sem`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}
