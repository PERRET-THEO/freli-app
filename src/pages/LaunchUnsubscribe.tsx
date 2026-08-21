import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SeoHead } from '../components/seo/SeoHead'
import { unsubscribeWaitlist } from '../lib/waitlistSignup'
import { siteConfig } from '../lib/seo/siteConfig'

export function LaunchUnsubscribe() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending')

  useEffect(() => {
    let cancelled = false
    unsubscribeWaitlist(token).then((result) => {
      if (cancelled) return
      setStatus(result.ok ? 'ok' : 'error')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--surface)] text-[var(--ink)]">
      <SeoHead path="/lancement" title="Désinscription — Freli" noindex />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <p className="font-display text-2xl font-extrabold tracking-tight">
          {status === 'pending'
            ? 'Désinscription…'
            : status === 'ok'
              ? 'Vous êtes désinscrit·e'
              : 'Lien invalide'}
        </p>
        <p className="mt-3 font-body text-sm leading-relaxed text-[var(--ink-muted)]">
          {status === 'pending'
            ? 'Un instant, nous enregistrons votre choix.'
            : status === 'ok'
              ? 'Vous ne recevrez plus d’email de Freli concernant le lancement. Si vous changez d’avis, vous pourrez vous réinscrire sur la page de lancement.'
              : 'Ce lien de désinscription n’est pas valide. Contactez-nous si le problème persiste.'}
        </p>
        <a
          href={siteConfig.siteUrl}
          className="mt-8 inline-flex font-body text-sm font-medium text-[var(--accent)] hover:underline"
        >
          Retourner sur freli.fr
        </a>
      </main>
    </div>
  )
}
