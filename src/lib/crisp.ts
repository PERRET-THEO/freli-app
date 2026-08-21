import { isMarketingSite } from './cookieConsent'

const CRISP_WEBSITE_ID = '89e1e90f-f745-4706-b929-364692ed74ea'

declare global {
  interface Window {
    $crisp?: unknown[]
    CRISP_WEBSITE_ID?: string
  }
}

let crispLoadStarted = false

export function isCrispAllowedHost(): boolean {
  return isMarketingSite()
}

/** Charge le script Crisp une seule fois, sur le site marketing (prod + localhost en dev). */
export function loadCrisp(): void {
  if (!isCrispAllowedHost()) return
  if (crispLoadStarted) return
  crispLoadStarted = true

  window.$crisp = window.$crisp ?? []
  window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID

  const script = document.createElement('script')
  script.src = 'https://client.crisp.chat/l.js'
  script.async = true
  document.head.appendChild(script)
}
