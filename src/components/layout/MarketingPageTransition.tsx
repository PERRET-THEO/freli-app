import { useOutlet } from 'react-router-dom'

/**
 * Layout marketing sans animation de route.
 * Les transitions opacity provoquaient un flash du body clair (--surface).
 */
export function MarketingPageTransition() {
  return useOutlet()
}
