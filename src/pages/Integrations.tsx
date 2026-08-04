import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { GoogleDriveSection } from '../components/integrations/GoogleDriveSection'
import { StripeConnectSection } from '../components/integrations/StripeConnectSection'
import { WebhooksSection } from '../components/integrations/WebhooksSection'
import type { IntegrationRow, WebhookDeliverySummary } from '../components/integrations/types'
import { isGoogleDriveConnected, parseGoogleDriveConfig } from '../lib/integrations/googleDrive'
import { isStripeReadyForCheckout, parseStripeConfig } from '../lib/integrations/stripe'
import {
  generateWebhookSecret,
  MAX_WEBHOOKS_PER_USER,
  parseWebhookConfig,
  validateWebhookUrlClient,
  type WebhookEvent,
} from '../lib/integrations/webhooks'
import { startGoogleDriveOAuth as launchGoogleDriveOAuth } from '../lib/googleDriveConnect'
import { openStripeExpressDashboard } from '../lib/stripeConnectDashboard'
import { supabase } from '../lib/supabase'

type ProviderKey = 'stripe' | 'google_drive'

export function Integrations() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([])
  const [saving, setSaving] = useState<ProviderKey | 'webhook' | null>(null)
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [stripeError, setStripeError] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [newWebhookLabel, setNewWebhookLabel] = useState('')
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState<WebhookEvent[]>([
    'project.completed',
  ])
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [lastDeliveries, setLastDeliveries] = useState<Record<string, WebhookDeliverySummary>>({})
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editEvents, setEditEvents] = useState<WebhookEvent[]>([])

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const webhookRows = integrations.filter((i) => i.provider === 'webhook')

  const reloadDeliveries = useCallback(async (uid: string, webhookIds: string[]) => {
    if (webhookIds.length === 0) {
      setLastDeliveries({})
      return
    }
    const { data } = await supabase
      .from('webhook_deliveries')
      .select('webhook_id, status, event, created_at, http_status, error')
      .eq('user_id', uid)
      .in('webhook_id', webhookIds)
      .order('created_at', { ascending: false })
      .limit(50)

    const map: Record<string, WebhookDeliverySummary> = {}
    for (const row of (data ?? []) as WebhookDeliverySummary[]) {
      if (!map[row.webhook_id]) map[row.webhook_id] = row
    }
    setLastDeliveries(map)
  }, [])

  const reloadIntegrations = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('integrations')
      .select('id, provider, config')
      .eq('user_id', uid)
    const rows = (data ?? []) as IntegrationRow[]
    setIntegrations(rows)
    const webhookIds = rows.filter((r) => r.provider === 'webhook').map((r) => r.id)
    await reloadDeliveries(uid, webhookIds)
  }, [reloadDeliveries])

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        navigate('/signin', { replace: true })
        return
      }
      setUserId(userData.user.id)
      await reloadIntegrations(userData.user.id)
      setLoading(false)
    }
    load()
  }, [navigate, reloadIntegrations])

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
        showToast('Compte Stripe lié — finalisez l\u2019inscription si besoin.')
      }

      await reloadIntegrations(userData.user.id)
    }

    void sync()
  }, [searchParams, setSearchParams, showToast, reloadIntegrations])

  useEffect(() => {
    const googleParam = searchParams.get('google')
    if (!googleParam) return

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('google')
        next.delete('message')
        return next
      },
      { replace: true },
    )

    if (googleParam === 'return') {
      showToast('Google Drive connecté.')
      void (async () => {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) return
        await reloadIntegrations(userData.user.id)
      })()
    } else if (googleParam === 'error') {
      const msg = searchParams.get('message')
      setGoogleError(msg ? decodeURIComponent(msg) : 'Connexion Google Drive annulée ou échouée.')
    }
  }, [searchParams, setSearchParams, showToast, reloadIntegrations])

  const isConnected = (provider: ProviderKey) => {
    const row = integrations.find((i) => i.provider === provider)
    if (!row) return false
    if (provider === 'google_drive') {
      return isGoogleDriveConnected(parseGoogleDriveConfig(row.config))
    }
    return true
  }

  const startStripeOnboarding = async () => {
    if (!userId) return
    setStripeError(null)
    setSaving('stripe')
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-start', { body: {} })
      const payload = data as { url?: string; error?: string } | null

      if (error) {
        let detail = payload?.error ?? error.message
        // Supabase FunctionsHttpError: body JSON often in error.context
        const ctx = (error as { context?: Response }).context
        if (!payload?.error && ctx && typeof ctx.json === 'function') {
          try {
            const body = (await ctx.json()) as { error?: string }
            if (body?.error) detail = body.error
          } catch {
            /* ignore parse errors */
          }
        }
        setStripeError(detail)
        return
      }
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
      } else {
        setIntegrations((prev) => prev.filter((i) => i.id !== existing.id))
        showToast('Stripe déconnecté')
      }
    }
    setSaving(null)
  }

  const openStripeDashboard = async () => {
    setStripeError(null)
    setSaving('stripe')
    try {
      await openStripeExpressDashboard()
    } catch (e) {
      setStripeError(e instanceof Error ? e.message : 'Impossible d\u2019ouvrir l\u2019espace Stripe')
    } finally {
      setSaving(null)
    }
  }

  const connectGoogleDrive = async () => {
    if (!userId) return
    setGoogleError(null)
    setSaving('google_drive')
    try {
      await launchGoogleDriveOAuth()
    } catch (e) {
      setGoogleError(e instanceof Error ? e.message : 'Impossible de connecter Google Drive')
    } finally {
      setSaving(null)
    }
  }

  const disconnectGoogleDrive = async () => {
    if (!userId) return
    setGoogleError(null)
    setSaving('google_drive')
    const existing = integrations.find((i) => i.provider === 'google_drive')
    if (existing) {
      const { error } = await supabase.from('integrations').delete().eq('id', existing.id)
      if (error) {
        setGoogleError(error.message)
      } else {
        setIntegrations((prev) => prev.filter((i) => i.id !== existing.id))
        showToast('Google Drive déconnecté')
      }
    }
    setSaving(null)
  }

  const toggleWebhookEvent = (event: WebhookEvent) => {
    setNewWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  const toggleEditWebhookEvent = (event: WebhookEvent) => {
    setEditEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  const startEditWebhook = (row: IntegrationRow) => {
    const cfg = parseWebhookConfig(row.config)
    setEditingWebhookId(row.id)
    setEditLabel(cfg.label)
    setEditUrl(cfg.url)
    setEditEvents(cfg.events)
    setWebhookError(null)
  }

  const cancelEditWebhook = () => {
    setEditingWebhookId(null)
    setEditLabel('')
    setEditUrl('')
    setEditEvents([])
  }

  const handleSaveEditWebhook = async (row: IntegrationRow) => {
    setWebhookError(null)
    const urlError = validateWebhookUrlClient(editUrl)
    if (urlError) {
      setWebhookError(urlError)
      return
    }
    if (editEvents.length === 0) {
      setWebhookError('Sélectionnez au moins un événement.')
      return
    }

    const label = editLabel.trim() || 'Webhook'
    const nextConfig = {
      ...row.config,
      url: editUrl.trim(),
      label,
      events: editEvents,
    }

    setSaving('webhook')
    const { error } = await supabase
      .from('integrations')
      .update({ config: nextConfig })
      .eq('id', row.id)
    setSaving(null)

    if (error) {
      setWebhookError(error.message)
      return
    }

    setIntegrations((prev) =>
      prev.map((i) => (i.id === row.id ? { ...i, config: nextConfig } : i)),
    )
    cancelEditWebhook()
    showToast('Webhook mis à jour.')
  }

  const handleRotateSecret = async (row: IntegrationRow) => {
    setWebhookError(null)
    const secret = generateWebhookSecret()
    const { error } = await supabase
      .from('integrations')
      .update({ access_token: secret })
      .eq('id', row.id)

    if (error) {
      setWebhookError(error.message)
      return
    }

    setRevealedSecret(secret)
    showToast('Nouveau secret généré.')
  }

  const handleAddWebhook = async () => {
    if (!userId) return
    setWebhookError(null)

    if (webhookRows.length >= MAX_WEBHOOKS_PER_USER) {
      setWebhookError(`Maximum ${MAX_WEBHOOKS_PER_USER} webhooks par compte.`)
      return
    }

    const urlError = validateWebhookUrlClient(newWebhookUrl)
    if (urlError) {
      setWebhookError(urlError)
      return
    }

    if (newWebhookEvents.length === 0) {
      setWebhookError('Sélectionnez au moins un événement.')
      return
    }

    const label = newWebhookLabel.trim() || 'Webhook'
    const secret = generateWebhookSecret()

    setSaving('webhook')
    const { data, error } = await supabase
      .from('integrations')
      .insert({
        user_id: userId,
        provider: 'webhook',
        access_token: secret,
        config: {
          url: newWebhookUrl.trim(),
          label,
          events: newWebhookEvents,
          enabled: true,
        },
      })
      .select('id, provider, config')
      .single()

    setSaving(null)

    if (error || !data) {
      setWebhookError(error?.message ?? 'Impossible d\u2019ajouter le webhook.')
      return
    }

    setIntegrations((prev) => [...prev, data as IntegrationRow])
    setNewWebhookLabel('')
    setNewWebhookUrl('')
    setNewWebhookEvents(['project.completed'])
    setRevealedSecret(secret)
    showToast('Webhook ajouté.')
  }

  const handleToggleWebhook = async (row: IntegrationRow) => {
    const cfg = parseWebhookConfig(row.config)
    const { error } = await supabase
      .from('integrations')
      .update({ config: { ...row.config, enabled: !cfg.enabled } })
      .eq('id', row.id)

    if (error) {
      setWebhookError(error.message)
      return
    }

    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === row.id
          ? { ...i, config: { ...i.config, enabled: !cfg.enabled } }
          : i,
      ),
    )
  }

  const handleDeleteWebhook = async (row: IntegrationRow) => {
    const { error } = await supabase.from('integrations').delete().eq('id', row.id)
    if (error) {
      setWebhookError(error.message)
      return
    }
    setIntegrations((prev) => prev.filter((i) => i.id !== row.id))
    setLastDeliveries((prev) => {
      const next = { ...prev }
      delete next[row.id]
      return next
    })
    if (editingWebhookId === row.id) cancelEditWebhook()
    showToast('Webhook supprimé.')
  }

  const handleTestWebhook = async (webhookId: string) => {
    setWebhookError(null)
    setTestingWebhookId(webhookId)
    try {
      const { data, error } = await supabase.functions.invoke('test-webhook', {
        body: { webhookId },
      })
      if (error) {
        setWebhookError('Test échoué — vérifiez l\u2019URL du webhook.')
        return
      }
      const payload = data as { ok?: boolean; error?: string } | null
      if (!payload?.ok) {
        setWebhookError(payload?.error ?? 'Test échoué.')
        return
      }
      showToast('Test envoyé (événement webhook.test).')
      if (userId) {
        await reloadDeliveries(userId, webhookRows.map((r) => r.id))
      }
    } finally {
      setTestingWebhookId(null)
    }
  }

  const stripeRow = integrations.find((i) => i.provider === 'stripe')
  const stripeCfg = parseStripeConfig(stripeRow?.config)
  const stripeCheckoutReady = isStripeReadyForCheckout(stripeCfg)
  const googleRow = integrations.find((i) => i.provider === 'google_drive')
  const googleCfg = parseGoogleDriveConfig(googleRow?.config)

  if (loading) {
    return (
      <DashboardLayout title="Intégrations" subtitle="Stripe, relances et outils" maxWidth="4xl">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      title="Intégrations"
      subtitle="Connectez vos outils pour automatiser la fin d'onboarding."
      maxWidth="4xl"
    >
      <div className="space-y-4">
        <StripeConnectSection
          connected={isConnected('stripe')}
          isSaving={saving === 'stripe'}
          stripeAccountId={stripeCfg.stripe_connect_account_id}
          stripeCheckoutReady={stripeCheckoutReady}
          stripeError={stripeError}
          onStartOnboarding={startStripeOnboarding}
          onOpenDashboard={openStripeDashboard}
          onDisconnect={disconnectStripe}
        />

        <GoogleDriveSection
          connected={isConnected('google_drive')}
          isSaving={saving === 'google_drive'}
          googleEmail={googleCfg.google_email}
          googleError={googleError}
          onConnect={connectGoogleDrive}
          onDisconnect={disconnectGoogleDrive}
        />

        <WebhooksSection
          webhookRows={webhookRows}
          saving={saving === 'webhook'}
          testingWebhookId={testingWebhookId}
          webhookError={webhookError}
          newWebhookLabel={newWebhookLabel}
          newWebhookUrl={newWebhookUrl}
          newWebhookEvents={newWebhookEvents}
          revealedSecret={revealedSecret}
          lastDeliveries={lastDeliveries}
          editingWebhookId={editingWebhookId}
          editLabel={editLabel}
          editUrl={editUrl}
          editEvents={editEvents}
          onNewWebhookLabelChange={setNewWebhookLabel}
          onNewWebhookUrlChange={setNewWebhookUrl}
          onToggleWebhookEvent={toggleWebhookEvent}
          onEditLabelChange={setEditLabel}
          onEditUrlChange={setEditUrl}
          onToggleEditWebhookEvent={toggleEditWebhookEvent}
          onStartEditWebhook={startEditWebhook}
          onCancelEditWebhook={cancelEditWebhook}
          onSaveEditWebhook={handleSaveEditWebhook}
          onRotateSecret={handleRotateSecret}
          onAddWebhook={handleAddWebhook}
          onToggleWebhook={handleToggleWebhook}
          onDeleteWebhook={handleDeleteWebhook}
          onTestWebhook={handleTestWebhook}
          onCopySecret={() => {
            if (!revealedSecret) return
            void navigator.clipboard.writeText(revealedSecret)
            showToast('Secret copié.')
          }}
        />
      </div>

      {toast && (
        <div className="fixed bottom-[calc(5.25rem+var(--safe-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm font-body text-[var(--white)] shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </DashboardLayout>
  )
}
