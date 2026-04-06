import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'freli-pwa-dismissed'
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    setIsStandalone(mediaQuery.matches)

    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      setIsStandalone(event.matches)
    }

    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_WINDOW_MS) {
      setDismissed(true)
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    mediaQuery.addEventListener('change', handleDisplayModeChange)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      mediaQuery.removeEventListener('change', handleDisplayModeChange)
    }
  }, [])

  const dismissBanner = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  const promptInstall = async () => {
    if (!installPrompt) return false
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null)
      return true
    }
    return false
  }

  return {
    canInstall: Boolean(installPrompt) && !dismissed && !isStandalone,
    isStandalone,
    promptInstall,
    dismissBanner,
  }
}
