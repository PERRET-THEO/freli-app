/** Élément qui scrolle vraiment (main mobile) ou le viewport (desktop). */
export function getAppScrollContainer(): HTMLElement | Window {
  if (typeof document === 'undefined') return window
  const main = document.querySelector('main')
  if (main instanceof HTMLElement) {
    const { overflowY } = getComputedStyle(main)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return main
    }
  }
  return window
}

export function getScrollTop(target: HTMLElement | Window = getAppScrollContainer()): number {
  if (target === window) {
    return window.scrollY || document.documentElement.scrollTop || 0
  }
  return (target as HTMLElement).scrollTop
}

export function getMaxScrollTop(target: HTMLElement | Window = getAppScrollContainer()): number {
  if (target === window) {
    const doc = document.documentElement
    return Math.max(0, doc.scrollHeight - window.innerHeight)
  }
  const el = target as HTMLElement
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

export function setScrollTop(
  top: number,
  target: HTMLElement | Window = getAppScrollContainer(),
): void {
  if (target === window) {
    window.scrollTo(0, top)
  } else {
    ;(target as HTMLElement).scrollTop = top
  }
}

/**
 * Restaure le scroll après chargement async (skeletons → contenu).
 * Réessaie jusqu’à ce que scrollHeight permette la cible, max `timeoutMs`.
 */
export function restoreScrollTop(
  saved: number,
  options?: { timeoutMs?: number; onDone?: () => void },
): () => void {
  const timeoutMs = options?.timeoutMs ?? 1000
  const start = performance.now()
  let cancelled = false
  let raf = 0

  const tick = () => {
    if (cancelled) return
    const max = getMaxScrollTop()
    const target = Math.min(saved, max)
    setScrollTop(target)
    if (max >= saved - 2 || performance.now() - start >= timeoutMs) {
      options?.onDone?.()
      return
    }
    raf = window.requestAnimationFrame(tick)
  }

  raf = window.requestAnimationFrame(tick)
  return () => {
    cancelled = true
    window.cancelAnimationFrame(raf)
  }
}
