import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { loadCrisp, isCrispAllowedHost } from '../../lib/crisp'
import {
  getCookieConsent,
  setCookieConsent,
  type CookieConsentChoice,
} from '../../lib/cookieConsent'

const choiceButtonClass =
  'inline-flex flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-2.5 font-body text-sm font-medium text-[var(--ink)] transition hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:flex-none sm:px-5'

export function CookieConsentBanner() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isCrispAllowedHost()) return
    if (pathname.startsWith('/lancement')) {
      setVisible(false)
      return
    }

    const consent = getCookieConsent()
    if (consent === 'accepted') {
      loadCrisp()
      return
    }
    if (consent === 'refused') return

    setVisible(true)
  }, [pathname])

  const handleChoice = (choice: CookieConsentChoice) => {
    setCookieConsent(choice)
    setVisible(false)
    if (choice === 'accepted') {
      loadCrisp()
    }
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-[var(--border)] bg-[var(--white)] px-4 py-4 shadow-[0_-8px_32px_rgba(13,15,20,0.12)] sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p
            id="cookie-consent-title"
            className="font-display text-sm font-semibold text-[var(--ink)]"
          >
            Cookies et chat en direct
          </p>
          <p
            id="cookie-consent-description"
            className="mt-1 font-body text-sm leading-relaxed text-[var(--ink-muted)]"
          >
            Nous utilisons Crisp pour le chat en direct. Ce service dépose un cookie non
            essentiel. Vous pouvez accepter ou refuser ; votre choix est mémorisé sur cet
            appareil.{' '}
            <Link to="/confidentialite" className="text-[var(--accent)] hover:underline">
              En savoir plus
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-3 sm:items-center">
          <button type="button" className={choiceButtonClass} onClick={() => handleChoice('refused')}>
            Refuser
          </button>
          <button type="button" className={choiceButtonClass} onClick={() => handleChoice('accepted')}>
            Accepter
          </button>
        </div>
      </div>
    </div>
  )
}
