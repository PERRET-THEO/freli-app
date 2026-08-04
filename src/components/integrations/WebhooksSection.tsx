import { Card, Input } from '../ui'
import {
  maskWebhookUrl,
  MAX_WEBHOOKS_PER_USER,
  parseWebhookConfig,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from '../../lib/integrations/webhooks'
import { WebhookSetupGuide } from './WebhookSetupGuide'
import type { IntegrationRow, WebhookDeliverySummary } from './types'

type Props = {
  webhookRows: IntegrationRow[]
  saving: boolean
  testingWebhookId: string | null
  webhookError: string | null
  newWebhookLabel: string
  newWebhookUrl: string
  newWebhookEvents: WebhookEvent[]
  revealedSecret: string | null
  lastDeliveries: Record<string, WebhookDeliverySummary>
  editingWebhookId: string | null
  editLabel: string
  editUrl: string
  editEvents: WebhookEvent[]
  onNewWebhookLabelChange: (value: string) => void
  onNewWebhookUrlChange: (value: string) => void
  onToggleWebhookEvent: (event: WebhookEvent) => void
  onEditLabelChange: (value: string) => void
  onEditUrlChange: (value: string) => void
  onToggleEditWebhookEvent: (event: WebhookEvent) => void
  onStartEditWebhook: (row: IntegrationRow) => void
  onCancelEditWebhook: () => void
  onSaveEditWebhook: (row: IntegrationRow) => void
  onRotateSecret: (row: IntegrationRow) => void
  onAddWebhook: () => void
  onToggleWebhook: (row: IntegrationRow) => void
  onDeleteWebhook: (row: IntegrationRow) => void
  onTestWebhook: (webhookId: string) => void
  onCopySecret: () => void
}

function formatDeliveryTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function WebhooksSection({
  webhookRows,
  saving,
  testingWebhookId,
  webhookError,
  newWebhookLabel,
  newWebhookUrl,
  newWebhookEvents,
  revealedSecret,
  lastDeliveries,
  editingWebhookId,
  editLabel,
  editUrl,
  editEvents,
  onNewWebhookLabelChange,
  onNewWebhookUrlChange,
  onToggleWebhookEvent,
  onEditLabelChange,
  onEditUrlChange,
  onToggleEditWebhookEvent,
  onStartEditWebhook,
  onCancelEditWebhook,
  onSaveEditWebhook,
  onRotateSecret,
  onAddWebhook,
  onToggleWebhook,
  onDeleteWebhook,
  onTestWebhook,
  onCopySecret,
}: Props) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="text-2xl">🔗</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Webhooks</h2>
          <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
            Direct : Zapier, Make, n8n, Slack. Via automatisateur : Notion, Airtable, CRM, compta —
            collez une URL HTTPS.
          </p>
        </div>
      </div>

      <WebhookSetupGuide />

      {webhookRows.length > 0 && (
        <ul className="mt-4 space-y-3">
          {webhookRows.map((row) => {
            const cfg = parseWebhookConfig(row.config)
            const delivery = lastDeliveries[row.id]
            const isEditing = editingWebhookId === row.id
            return (
              <li
                key={row.id}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] p-4"
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <Input
                      placeholder="Nom"
                      value={editLabel}
                      onChange={(e) => onEditLabelChange(e.target.value)}
                    />
                    <Input
                      placeholder="https://…"
                      value={editUrl}
                      onChange={(e) => onEditUrlChange(e.target.value)}
                    />
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-body font-medium text-[var(--ink-soft)]">
                        Événements
                      </legend>
                      {WEBHOOK_EVENTS.map((event) => (
                        <label key={event} className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            checked={editEvents.includes(event)}
                            onChange={() => onToggleEditWebhookEvent(event)}
                            className="mt-0.5"
                          />
                          <span className="text-sm font-body text-[var(--ink)]">
                            {WEBHOOK_EVENT_LABELS[event].label}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => onSaveEditWebhook(row)}
                        className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-1.5 text-xs font-body font-medium text-[var(--white)] disabled:opacity-50"
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={onCancelEditWebhook}
                        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink)]"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-body text-sm font-medium text-[var(--ink)]">
                          {cfg.label}
                        </p>
                        <p className="mt-0.5 truncate font-body text-xs text-[var(--ink-muted)]">
                          {maskWebhookUrl(cfg.url)}
                        </p>
                        <p className="mt-2 font-body text-xs text-[var(--ink-soft)]">
                          {cfg.events.map((e) => WEBHOOK_EVENT_LABELS[e]?.label ?? e).join(' · ')}
                        </p>
                        {delivery ? (
                          <p
                            className={`mt-2 font-body text-xs ${
                              delivery.status === 'success'
                                ? 'text-[var(--mint)]'
                                : 'text-[var(--amber)]'
                            }`}
                          >
                            Dernière livraison :{' '}
                            {delivery.status === 'success' ? 'succès' : 'échec'}
                            {delivery.http_status ? ` (${delivery.http_status})` : ''} ·{' '}
                            {formatDeliveryTime(delivery.created_at)}
                            {delivery.error ? ` — ${delivery.error}` : ''}
                          </p>
                        ) : (
                          <p className="mt-2 font-body text-xs text-[var(--ink-muted)]">
                            Aucune livraison enregistrée.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleWebhook(row)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-body font-medium ${
                            cfg.enabled
                              ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                              : 'bg-[var(--surface-warm)] text-[var(--ink-muted)]'
                          }`}
                        >
                          {cfg.enabled ? 'Actif' : 'Inactif'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartEditWebhook(row)}
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink)] hover:border-[var(--accent)]"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => onRotateSecret(row)}
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink)] hover:border-[var(--accent)]"
                        >
                          Régénérer secret
                        </button>
                        <button
                          type="button"
                          disabled={testingWebhookId === row.id}
                          onClick={() => onTestWebhook(row.id)}
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink)] hover:border-[var(--accent)]"
                        >
                          {testingWebhookId === row.id ? '...' : 'Tester'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteWebhook(row)}
                          className="rounded-[var(--radius-sm)] border border-[#EF4444] px-3 py-1.5 text-xs font-body text-[#EF4444] hover:bg-[#FEF2F2]"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {revealedSecret && (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--mint)]/40 bg-[var(--mint-soft)] p-3">
          <p className="text-xs font-body font-medium text-[var(--ink)]">
            Secret de signature (copiez-le maintenant, il ne sera plus affiché) :
          </p>
          <code className="mt-2 block break-all font-mono text-xs text-[var(--ink-soft)]">
            {revealedSecret}
          </code>
          <button
            type="button"
            className="mt-2 text-xs font-body text-[var(--accent)] hover:underline"
            onClick={onCopySecret}
          >
            Copier le secret
          </button>
        </div>
      )}

      <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-5">
        <p className="text-sm font-body font-medium text-[var(--ink)]">Ajouter un webhook</p>
        <Input
          placeholder="Nom (ex. n8n — CRM clients)"
          value={newWebhookLabel}
          onChange={(e) => onNewWebhookLabelChange(e.target.value)}
        />
        <Input
          placeholder="https://hooks.zapier.com/... ou https://hooks.slack.com/..."
          value={newWebhookUrl}
          onChange={(e) => onNewWebhookUrlChange(e.target.value)}
        />
        <fieldset className="space-y-2">
          <legend className="text-xs font-body font-medium text-[var(--ink-soft)]">Événements</legend>
          {WEBHOOK_EVENTS.map((event) => (
            <label key={event} className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={newWebhookEvents.includes(event)}
                onChange={() => onToggleWebhookEvent(event)}
                className="mt-0.5"
              />
              <span className="text-sm font-body text-[var(--ink)]">
                {WEBHOOK_EVENT_LABELS[event].label}
                <span className="block text-xs text-[var(--ink-muted)]">
                  {WEBHOOK_EVENT_LABELS[event].description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {webhookError ? (
          <p className="text-sm font-body text-[var(--amber)]">{webhookError}</p>
        ) : null}
        <button
          type="button"
          disabled={saving || webhookRows.length >= MAX_WEBHOOKS_PER_USER}
          onClick={onAddWebhook}
          className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95 disabled:opacity-50"
        >
          {saving ? 'Ajout…' : 'Ajouter le webhook'}
        </button>
      </div>
    </Card>
  )
}
