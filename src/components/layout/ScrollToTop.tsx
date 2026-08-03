import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Remonte en haut du viewport à chaque changement de pathname (pas sur hash seul). */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
