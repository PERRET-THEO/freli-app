import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Surfaces a reload CTA when a new service worker is waiting.
 * Works for dashboard and client portal (/p/:token) — mounted at App root.
 * With registerType autoUpdate, activation is usually automatic; this covers
 * the case where the new SW is ready but the tab still shows stale UI.
 */
export function PwaUpdateBridge() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // Pick up deploys while the tab stays open (portal sessions, long dashboards).
      const intervalMs = 5 * 60 * 1000
      window.setInterval(() => {
        void registration.update()
      }, intervalMs)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed bottom-[calc(1rem+var(--safe-bottom))] left-1/2 z-[100] flex max-w-[min(92vw,24rem)] -translate-x-1/2 items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-3 text-sm font-body text-[var(--white)] shadow-lg"
    >
      <span>Nouvelle version disponible</span>
      <button
        type="button"
        className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--white)] px-3 py-1.5 text-sm font-medium text-[var(--ink)]"
        onClick={() => {
          void updateServiceWorker(true)
          setNeedRefresh(false)
        }}
      >
        Recharger
      </button>
    </div>
  )
}
