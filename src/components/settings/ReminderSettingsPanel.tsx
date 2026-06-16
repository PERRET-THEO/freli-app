import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../ui'
import { formatRelative } from '../../lib/formatRelative'
import {
  REMINDER_DELAY_OPTIONS,
  type ReminderLogRow,
} from '../../lib/reminderSettings'
import { supabase } from '../../lib/supabase'

type ReminderSettingsPanelProps = {
  agencyId: string | null
  enabled: boolean
  delayHours: number
  onEnabledChange: (value: boolean) => void
  onDelayChange: (hours: number) => void
  onSave: () => void
  saving: boolean
  feedback: { type: 'success' | 'error'; text: string } | null
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
}: ReminderSettingsPanelProps) {
  const [autoCountMonth, setAutoCountMonth] = useState(0)
  const [recentLogs, setRecentLogs] = useState<ReminderLogRow[]>([])

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
            {recentLogs.map((log) => (
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
