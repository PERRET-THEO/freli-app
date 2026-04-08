import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card } from '../components/ui'

export function ConfirmEmail() {
  const [status, setStatus] = useState<'loading' | 'confirmed' | 'error'>('loading')
  const navigate = useNavigate()

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setStatus('confirmed')
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStatus('confirmed')
      } else {
        const timeout = setTimeout(() => setStatus('error'), 5000)
        return () => clearTimeout(timeout)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <p className="text-sm font-body text-[var(--ink-muted)]">Vérification en cours…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)]">
            Lien invalide ou expiré
          </h1>
          <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
            Le lien de confirmation n&apos;est plus valide. Connecte-toi ou demande un
            nouveau lien.
          </p>
          <Link to="/signin">
            <Button className="mt-6">Aller à la connexion</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--mint-soft)]">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
          Adresse email confirmée
        </h1>
        <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
          Ton compte est activé. Tu peux maintenant accéder à ton espace.
        </p>
        <Button className="mt-6 w-full" onClick={() => navigate('/dashboard', { replace: true })}>
          Accéder au dashboard
        </Button>
      </Card>
    </div>
  )
}
