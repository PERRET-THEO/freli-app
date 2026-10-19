import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { getScrollTop, restoreScrollTop, setScrollTop } from '../../lib/scrollContainer'

const savedPositions = new Map<string, number>()

function isDashboardHome(pathname: string): boolean {
  return pathname === '/dashboard' || pathname === '/dashboard/'
}

/**
 * - Remonte en haut à l’arrivée sur une page projet.
 * - Restaure la position du tableau de bord au retour (après skeletons / contenu).
 * - Autres routes : scroll top (comportement historique).
 */
export function ScrollToTop() {
  const { pathname } = useLocation()
  const prevPathname = useRef(pathname)

  useEffect(() => {
    const prev = prevPathname.current
    if (prev !== pathname && isDashboardHome(prev)) {
      savedPositions.set('/dashboard', getScrollTop())
    }
    prevPathname.current = pathname

    if (isDashboardHome(pathname)) {
      const saved = savedPositions.get('/dashboard')
      if (saved != null && saved > 0) {
        return restoreScrollTop(saved, { timeoutMs: 1000 })
      }
      setScrollTop(0)
      return
    }

    setScrollTop(0)
  }, [pathname])

  return null
}
