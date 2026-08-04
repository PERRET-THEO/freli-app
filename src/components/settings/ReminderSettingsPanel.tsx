import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../ui'
import { formatRelative } from '../../lib/formatRelative'
import {
  REMINDER_DELAY_OPTIONS,
  type ReminderLogRow,
} from '../../lib/reminderSettings'
import {
  SMART_REMINDER_MAX_OPTIONS,
  TONE_OPTIONS,
  type SmartReminderTone,
} from '../../lib/smartReminders'
import { supabase } from '../../lib/supabase'

const VISIBLE_RECENT_LOGS = 3

type ReminderSettingsPanelProps = {
  agencyId: string | null
  enabled: boolean
  delayHours: number
  onEnabledChange: (value: boolean) => void
  onDelayChange: (hours: number) => void
  onSave: () => void
  saving: boolean
  feedback: { type: 'success' | 'error'; text: string } | null
  aiEnabled: boolean
  aiTone: SmartReminderTone
  aiAutoSend: boolean
  aiMaxPerProject: number
  aiSendHourStart: number
  aiSendHourEnd: number
  onAiToneChange: (tone: SmartReminderTone) => void
  onAiAutoSendChange: (value: boolean) => void
  onAiMaxChange: (value: number) => void
  onAiSendHourStartChange: (value: number) => void
  onAiSendHourEndChange: (value: number) => void
}

function clientNameFromLog(log: ReminderLogRow): string {
  const rel = log.projects
  if (!rel) return 'Client'
  const row = Array.isArray(rel) ? rel[0] : rel
  return row?.client_name?.trim() || 'Client'
}

export function ReminderSettingsPanel({
  agencyId,
  enabled,
  delayHours,
  onEnabledChange,
  onDelayChange,
  onSave,
  saving,
  feedback,
  aiEnabled,
  aiTone,
  aiAutoSend,
  aiMaxPerProject,
  aiSendHourStart,
  aiSendHourEnd,
  onAiToneChange,
  onAiAutoSendChange,
  onAiMaxChange,
  onAiSendHourStartChange,
  onAiSendHourEndChange,
}: ReminderSettingsPanelProps) {
  const [autoCountMonth, setAutoCountMonth] = useState(0)
  const [recentLogs, setRecentLogs] = useState<ReminderLogRow[]>([])
  const [showAllLogs, setShowAllLogs] = useState(false)

  useEffect(() => {
    if (!agencyId) return
    const load = async () => {
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)

      const { count } = await supabase
        .from('project_reminder_logs')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .eq('source', 'auto')
        .gte('sent_at', monthStart.toISOString())

      setAutoCountMonth(count ?? 0)

      const { data: logs } = await supabase
        .from('project_reminder_logs')
        .select('id, project_id, recipient_email, sent_at, source, projects(client_name)')
        .eq('agency_id', agencyId)
        .order('sent_at', { ascending: false })
        .limit(5)

      setRecentLogs((logs ?? []) as ReminderLogRow[])
    }
    void load()
  }, [agencyId, feedback])

  const visibleLogs = showAllLogs ? recentLogs : recentLogs.slice(0, VISIBLE_RECENT_LOGS)
  const hiddenLogsCount = Math.max(0, recentLogs.length - VISIBLE_RECENT_LOGS)

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
        <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Comment ça marche</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs font-body leading-relaxed text-[var(--ink-muted)]">
          <li>Freli surveille les projets non terminés avec une checklist incomplète.</li>
          <li>Après le délai choisi, un email de relance part automatiquement au client.</li>
          <li>Une nouvelle relance auto n&apos;est envoyée qu&apos;après le même délai.</li>
          <li>Vous pouvez toujours relancer manuellement depuis la fiche projet.</li>
        </ol>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-4">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
        />
        <span>
          <span className="block text-sm font-body font-medium text-[var(--ink)]">
            Relances automatiques activées
          </span>
          <span className="mt-0.5 block text-xs font-body text-[var(--ink-muted)]">
            {enabled
              ? 'Freli enverra des emails de relance sans action de votre part.'
              : 'Seules les relances manuelles depuis la fiche projet seront possibles.'}
          </span>
        </span>
      </label>

      <div className={enabled ? '' : 'pointer-events-none opacity-50'}>
        <p className="text-sm font-body font-medium text-[var(--ink-soft)]">
          Délai avant la première relance (et entre deux relances)
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {REMINDER_DELAY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-sm font-body transition ${
                delayHours === option.value
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--white)] text-[var(--ink-soft)] hover:border-[var(--accent)]'
              }`}
            >
              <input
                type="radio"
                name="reminder-delay"
                value={option.value}
                checked={delayHours === option.value}
                onChange={() => onDelayChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-[var(--radius-sm)] border border-[var(--accent)]/25 bg-[var(--accent-soft)]/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-body font-semibold text-[var(--ink)]">✨ Relances intelligentes</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-body font-medium ${
              aiEnabled
                ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                : 'bg-[var(--surface-warm)] text-[var(--ink-muted)]'
            }`}
          >
            {aiEnabled ? 'Module activé' : 'Module désactivé'}
          </span>
        </div>
        <p className="mt-1 text-xs font-body leading-relaxed text-[var(--ink-muted)]">
          Le contenu des relances s&apos;adapte au comportement email du client (non ouvert, ouvert
          sans clic vers le portail, étape bloquante). Le déclenchement reste basé sur le délai
          ci-dessus et sur des règles vérifiables — l&apos;IA ne rédige que le contenu.
          {!aiEnabled ? ' Activez le module dans la section « Intelligence artificielle ».' : ''}
        </p>

        <div className={aiEnabled ? 'mt-4 space-y-4' : 'pointer-events-none mt-4 space-y-4 opacity-50'}>
          <div>
            <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Ton de marque</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TONE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-body transition ${
                    aiTone === option.value
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--white)] text-[var(--ink-soft)] hover:border-[var(--accent)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="ai-reminder-tone"
                    value={option.value}
                    checked={aiTone === option.value}
                    onChange={() => onAiToneChange(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-body font-medium text-[var(--ink-soft)]">
              Plafond de relances IA par projet (anti-harcèlement)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SMART_REMINDER_MAX_OPTIONS.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-body transition ${
                    aiMaxPerProject === value
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--white)] text-[var(--ink-soft)] hover:border-[var(--accent)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="ai-reminder-max"
                    value={value}
                    checked={aiMaxPerProject === value}
                    onChange={() => onAiMaxChange(value)}
                    className="sr-only"
                  />
                  {value} max
                </label>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-3">
            <input
              type="checkbox"
              checked={aiAutoSend}
              onChange={(e) => onAiAutoSendChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
            />
            <span>
              <span className="block text-xs font-body font-medium text-[var(--ink)]">
                Envoi automatique des relances générées (après le 1er envoi)
              </span>
              <span className="mt-0.5 block text-xs font-body text-[var(--ink-muted)]">
                {aiAutoSend
                  ? 'Attention : la première relance d’un projet reste toujours en brouillon à valider. Les suivantes partent sans relecture. Vous gardez l’historique dans chaque fiche projet.'
                  : 'Chaque relance est proposée en brouillon dans la fiche projet, à valider avant envoi.'}
              </span>
            </span>
          </label>

          <div>
            <p className="text-xs font-body font-medium text-[var(--ink-soft)]">
              Plage d’envoi (heure de Paris)
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-body text-[var(--ink-soft)]">
              <label className="flex items-center gap-1.5">
                De
                <select
                  value={aiSendHourStart}
                  onChange={(e) => onAiSendHourStartChange(Number(e.target.value))}
                  className="rounded border border-[var(--border)] bg-[var(--white)] px-2 py-1"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}h
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                à
                <select
                  value={aiSendHourEnd}
                  onChange={(e) => onAiSendHourEndChange(Number(e.target.value))}
                  className="rounded border border-[var(--border)] bg-[var(--white)] px-2 py-1"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h + 1} value={h + 1}>
                      {String(h + 1).padStart(2, '0')}h
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--surface-warm)] px-4 py-3">
        <span className="text-2xl" aria-hidden>
          📬
        </span>
        <div>
          <p className="text-sm font-body font-medium text-[var(--ink)]">
            {autoCountMonth} relance{autoCountMonth !== 1 ? 's' : ''} auto ce mois-ci
          </p>
          <p className="text-xs font-body text-[var(--ink-muted)]">
            Les relances manuelles ne sont pas comptées ici.
          </p>
        </div>
      </div>

      {recentLogs.length > 0 ? (
        <div>
          <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Dernières relances</p>
          <ul className="mt-2 space-y-2">
            {visibleLogs.map((log) => (
              <li key={log.id}>
                {log.project_id ? (
                  <Link
                    to={`/dashboard/project/${log.project_id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body transition hover:border-[var(--accent)]"
                  >
                    <span className="font-medium text-[var(--ink)]">{clientNameFromLog(log)}</span>
                    <span className="text-[var(--ink-muted)]">
                      {log.source === 'auto' ? 'Auto' : 'Manuelle'} · {formatRelative(log.sent_at)}
                    </span>
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body">
                    <span className="font-medium text-[var(--ink)]">{clientNameFromLog(log)}</span>
                    <span className="text-[var(--ink-muted)]">
                      {log.source === 'auto' ? 'Auto' : 'Manuelle'} · {formatRelative(log.sent_at)}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {hiddenLogsCount > 0 ? (
            <div className="mt-2 text-center">
              <button
                type="button"
                className="text-xs font-body text-[var(--accent)]"
                aria-expanded={showAllLogs}
                onClick={() => setShowAllLogs((v) => !v)}
              >
                {showAllLogs ? 'Réduire' : `Voir l’historique (${hiddenLogsCount})`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Button onClick={onSave} disabled={saving || !agencyId}>
        {saving ? 'Enregistrement…' : 'Enregistrer les relances'}
      </Button>

      {feedback ? (
        <p
          className={`text-sm font-body ${
            feedback.type === 'success' ? 'text-[var(--mint)]' : 'text-[var(--amber)]'
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  )
}
