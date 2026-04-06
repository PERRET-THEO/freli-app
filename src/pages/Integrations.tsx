import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Input } from '../components/ui'
import { isStripeReadyForCheckout, parseStripeConfig } from '../lib/integrations/stripe'
import { supabase } from '../lib/supabase'

type IntegrationRow = {
  id: string
  provider: string
  access_token: string | null
  config: Record<string, unknown>
}

type ProviderKey = 'stripe' | 'google_drive' | 'hubspot'

const PROVIDERS: { key: ProviderKey; label: string; icon: string; description: string }[] = [
  {
    key: 'stripe',
    label: 'Stripe',
    icon: '💳',
    description: 'Encaissez automatiquement vos clients à la fin de l\u2019onboarding.',
  },
  {
    key: 'google_drive',
    label: 'Google Drive',
    icon: '📁',
    description: 'Créez automatiquement un dossier client dans votre Drive.',
  },
  {
    key: 'hubspot',
    label: 'HubSpot',
    icon: '📊',
    description: 'Ajoutez automatiquement le contact client dans votre CRM.',
  },
]

export function Integrations() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([])
  const [saving, setSaving] = useState<ProviderKey | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [stripeError, setStripeError] = useState<string | null>(null)
  const [hubspotKey, setHubspotKey] = useState('')

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        navigate('/auth', { replace: true })
        return
      }
      setUserId(userData.user.id)

      const { data } = await supabase
        .from('integrations')
        .select('id, provider, access_token, config')
        .eq('user_id', userData.user.id)

      const rows = (data ?? []) as IntegrationRow[]
      setIntegrations(rows)

      const hubspot = rows.find((r) => r.provider === 'hubspot')
      if (hubspot) setHubspotKey(String(hubspot.config?.apiKey ?? hubspot.access_token ?? ''))

      setLoading(false)
    }
    load()
  }, [navigate])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => {
    const stripeParam = searchParams.get('stripe')
    if (stripeParam !== 'return' && stripeParam !== 'refresh') return

    const sync = async () => {
      const { data: userData } = await supabase.auth.getUser()
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('stripe')
          return next
        },
        { replace: true },
      )
      if (!userData.user) return

      const { data, error } = await supabase.functions.invoke('stripe-connect-status', {
        body: {},
      })

      if (error) {
        setStripeError(error.message)
        return
      }
      const payload = data as {
        charges_enabled?: boolean
        connected?: boolean
        error?: string
      } | null
      if (payload?.error) {
        setStripeError(payload.error)
        return
      }
      if (payload?.charges_enabled) {
        showToast('Stripe est prêt à encaisser les paiements.')
      } else if (payload?.connected) {
        showToast('Compte Stripe lié — finalisez l’inscription si besoin.')
      }

      const { data: rows } = await supabase
        .from('integrations')
        .select('id, provider, access_token, config')
        .eq('user_id', userData.user.id)

      setIntegrations((rows ?? []) as IntegrationRow[])
    }

    void sync()
  }, [searchParams, setSearchParams, showToast])

  const isConnected = (provider: ProviderKey) =>
    integrations.some((i) => i.provider === provider)

  const startStripeOnboarding = async () => {
    if (!userId) return
    setStripeError(null)
    setSaving('stripe')
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-start', { body: {} })
      if (error) {
        setStripeError(error.message)
        console.error('stripe-connect-start:', error)
        return
      }
      const payload = data as { url?: string; error?: string } | null
      if (payload?.error) {
        setStripeError(payload.error)
        return
      }
      if (payload?.url) {
        window.location.href = payload.url
        return
      }
      setStripeError('Réponse Stripe inattendue')
    } finally {
      setSaving(null)
    }
  }

  const disconnectStripe = async () => {
    if (!userId) return
    setStripeError(null)
    setSaving('stripe')
    const existing = integrations.find((i) => i.provider === 'stripe')
    if (existing) {
      const { error } = await supabase.from('integrations').delete().eq('id', existing.id)
      if (error) {
        setStripeError(error.message)
        console.error('Stripe disconnect:', error)
      } else {
        setIntegrations((prev) => prev.filter((i) => i.id !== existing.id))
        showToast('Stripe déconnecté')
      }
    }
    setSaving(null)
  }

  const handleToggleGoogleDrive = async () => {
    if (!userId) return
    setSaving('google_drive')

    if (isConnected('google_drive')) {
      const existing = integrations.find((i) => i.provider === 'google_drive')
      if (existing) {
        await supabase.from('integrations').delete().eq('id', existing.id)
        setIntegrations((prev) => prev.filter((i) => i.id !== existing.id))
        showToast('Google Drive déconnecté')
      }
    } else {
      const { data, error } = await supabase
        .from('integrations')
        .insert({ user_id: userId, provider: 'google_drive', config: { folderPrefix: 'Clients' } })
        .select('id, provider, access_token, config')
        .single()

      if (!error && data) {
        setIntegrations((prev) => [...prev, data as IntegrationRow])
        showToast('Google Drive activé (MVP)')
      }
    }
    setSaving(null)
  }

  const handleToggleHubspot = async () => {
    if (!userId) return
    setSaving('hubspot')

    if (isConnected('hubspot')) {
      const existing = integrations.find((i) => i.provider === 'hubspot')
      if (existing) {
        await supabase.from('integrations').delete().eq('id', existing.id)
        setIntegrations((prev) => prev.filter((i) => i.id !== existing.id))
        setHubspotKey('')
        showToast('HubSpot déconnecté')
      }
    } else {
      if (!hubspotKey.trim()) return
      const { data, error } = await supabase
        .from('integrations')
        .insert({
          user_id: userId,
          provider: 'hubspot',
          access_token: hubspotKey.trim(),
          config: { apiKey: hubspotKey.trim(), createDeal: false },
        })
        .select('id, provider, access_token, config')
        .single()

      if (!error && data) {
        setIntegrations((prev) => [...prev, data as IntegrationRow])
        showToast('HubSpot connecté')
      }
    }
    setSaving(null)
  }

  const stripeRow = integrations.find((i) => i.provider === 'stripe')
  const stripeCfg = parseStripeConfig(stripeRow?.config)
  const stripeCheckoutReady = isStripeReadyForCheckout(stripeCfg)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-sm font-body text-[var(--ink-muted)] hover:text-[var(--accent)]"
        >
          ← Dashboard
        </Link>

        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
          Intégrations
        </h1>
        <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
          Connectez vos outils pour automatiser la fin d&apos;onboarding.
        </p>

        <div className="mt-6 space-y-4">
          {PROVIDERS.map((provider) => {
            const connected = isConnected(provider.key)
            const isSaving = saving === provider.key

            return (
              <Card key={provider.key}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{provider.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
                          {provider.label}
                        </h2>
                        {connected && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-body font-medium ${
                              provider.key === 'stripe' && stripeRow && !stripeCheckoutReady
                                ? 'bg-[var(--amber)]/15 text-[var(--amber)]'
                                : 'bg-[var(--mint-soft)] text-[var(--mint)]'
                            }`}
                          >
                            {provider.key === 'stripe' && stripeRow && !stripeCheckoutReady
                              ? 'À finaliser'
                              : 'Connecté'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
                        {provider.description}
                      </p>
                    </div>
                  </div>
                </div>

                {provider.key === 'stripe' && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-body text-[var(--ink-muted)]">
                      Les paiements vont sur <strong>votre</strong> compte Stripe (Connect Express). Le
                      montant par projet est défini à la création (« Prix (€) »).
                    </p>
                    {stripeRow && stripeCfg.stripe_connect_account_id && (
                      <p className="text-xs font-body text-[var(--ink-muted)]">
                        Compte connecté : …{stripeCfg.stripe_connect_account_id.slice(-6)}
                        {stripeCheckoutReady ? ' — prêt à encaisser.' : ' — finalisez l’inscription chez Stripe.'}
                      </p>
                    )}
                    {stripeError ? (
                      <p className="text-sm font-body text-[var(--amber)]">{stripeError}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {(!connected || !stripeCheckoutReady) && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={startStripeOnboarding}
                          className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95 disabled:opacity-50"
                        >
                          {isSaving
                            ? '...'
                            : connected
                              ? 'Poursuivre l’inscription Stripe'
                              : 'Connecter mon compte Stripe'}
                        </button>
                      )}
                      {connected && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={disconnectStripe}
                          className="rounded-[var(--radius-sm)] border border-[#EF4444] bg-transparent px-5 py-2.5 text-sm font-body font-medium text-[#EF4444] transition hover:bg-[#FEF2F2] disabled:opacity-50"
                        >
                          Déconnecter Stripe
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {provider.key === 'google_drive' && (
                  <div className="mt-4">
                    <p className="mb-3 text-xs font-body text-[var(--ink-muted)]">
                      MVP : crée un dossier /Clients/NomClient dans votre Drive. L&apos;authentification OAuth complète arrivera prochainement.
                    </p>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleToggleGoogleDrive}
                      className={`rounded-[var(--radius-sm)] px-5 py-2.5 text-sm font-body font-medium transition disabled:opacity-50 ${
                        connected
                          ? 'border border-[#EF4444] bg-transparent text-[#EF4444] hover:bg-[#FEF2F2]'
                          : 'bg-[var(--accent)] text-[var(--white)] hover:brightness-95'
                      }`}
                    >
                      {isSaving
                        ? '...'
                        : connected
                          ? 'Déconnecter Google Drive'
                          : 'Activer Google Drive'}
                    </button>
                  </div>
                )}

                {provider.key === 'hubspot' && (
                  <div className="mt-4 space-y-3">
                    {!connected && (
                      <div>
                        <label className="mb-1 block text-xs font-body text-[var(--ink-muted)]">
                          Clé API HubSpot
                        </label>
                        <Input
                          type="password"
                          placeholder="pat-na1-..."
                          value={hubspotKey}
                          onChange={(e) => setHubspotKey(e.target.value)}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={isSaving || (!connected && !hubspotKey.trim())}
                      onClick={handleToggleHubspot}
                      className={`rounded-[var(--radius-sm)] px-5 py-2.5 text-sm font-body font-medium transition disabled:opacity-50 ${
                        connected
                          ? 'border border-[#EF4444] bg-transparent text-[#EF4444] hover:bg-[#FEF2F2]'
                          : 'bg-[var(--accent)] text-[var(--white)] hover:brightness-95'
                      }`}
                    >
                      {isSaving
                        ? '...'
                        : connected
                          ? 'Déconnecter HubSpot'
                          : 'Connecter HubSpot'}
                    </button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm font-body text-[var(--white)] shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </div>
  )
}
