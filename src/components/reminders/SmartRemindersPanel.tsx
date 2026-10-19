import { useEffect, useState } from 'react'
import { Button, Card } from '../ui'
import { formatRelative } from '../../lib/formatRelative'
import {
  BEHAVIOR_LABELS,
  dismissSmartReminder,
  fetchProjectSmartReminders,
  requestSmartReminder,
  sendSmartReminder,
  type SmartReminderRecord,
} from '../../lib/smartReminders'
import { isDraftSendable } from '../../lib/smartReminderDraft'
import { supabase } from '../../lib/supabase'

type SmartRemindersPanelProps = {
  projectId: string
  aiEnabled?: boolean
  /** Libellés des actions encore attendues côté client (filtre brouillons stale). */
  clientActionLabels?: string[]
  onSent?: () => void
  onRequestGenerate?: () => void | Promise<void>
}

function DraftCard({
  reminder,
  onProcessed,
}: {
  reminder: SmartReminderRecord
  onProcessed: () => void
}) {
  const [subject, setSubject] = useState(reminder.subject)
  const [body, setBody] = useState(reminder.body)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSend = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await sendSmartReminder(reminder.id, subject, body)
      onProcessed()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : "Impossible d'envoyer la relance.")
      setBusy(false)
    }
  }

  const handleDismiss = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await dismissSmartReminder(reminder.id)
      onProcessed()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Impossible d’ignorer la relance.')
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-body font-medium text-[var(--accent)]">
          Brouillon · {BEHAVIOR_LABELS[reminder.behavior_category]}
        </span>
        <span className="text-xs font-body text-[var(--ink-muted)]">
          Généré {formatRelative(reminder.created_at)}
        </span>
      </div>
      {reminder.blocking_step_label ? (
        <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
          Étape bloquante : {reminder.blocking_step_label}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm font-body font-medium text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={handleSend} disabled={busy || !subject.trim() || !body.trim()}>
          {busy ? 'Traitement…' : 'Envoyer la relance'}
        </Button>
        <Button variant="secondary" onClick={handleDismiss} disabled={busy}>
          Ignorer
        </Button>
      </div>
      {errorMsg ? <p className="mt-2 text-xs font-body text-[var(--amber)]">{errorMsg}</p> : null}
    </div>
  )
}

export function SmartRemindersPanel({
  projectId,
  aiEnabled = true,
  clientActionLabels = [],
  onSent,
  onRequestGenerate,
}: SmartRemindersPanelProps) {
  const [reminders, setReminders] = useState<SmartReminderRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const load = async () => {
    try {
      const rows = await fetchProjectSmartReminders(projectId)
      const staleIds = rows
        .filter((row) => row.status === 'draft' && !isDraftSendable(row, clientActionLabels))
        .map((row) => row.id)
      if (staleIds.length > 0) {
        await supabase.from('smart_reminders').update({ status: 'stale' }).in('id', staleIds)
      }
      setReminders(
        rows.map((row) =>
          staleIds.includes(row.id) ? { ...row, status: 'stale' as const } : row,
        ),
      )
    } catch {
      // table absente ou erreur réseau : la section reste vide
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, clientActionLabels.join('|')])

  const handleProcessed = () => {
    void load()
    onSent?.()
  }

  const noClientAction = clientActionLabels.length === 0
  const generateDisabledReason = noClientAction
    ? 'Rien à demander au client : des éléments attendent votre validation'
    : null

  const handleGenerateNow = async () => {
    if (noClientAction) return
    setGenerating(true)
    setGenerateError(null)
    try {
      if (onRequestGenerate) {
        await onRequestGenerate()
      } else {
        const result = await requestSmartReminder(projectId)
        const rows = await fetchProjectSmartReminders(projectId)
        const usable = rows.filter((row) => isDraftSendable(row, clientActionLabels))
        if (result.status === 'draft' && !result.existing && usable.length === 0) {
          throw new Error(
            "Le brouillon n'a pas pu être généré — contenu refusé par le contrôle. Réessayez.",
          )
        }
      }
      await load()
      onSent?.()
    } catch (reason) {
      setGenerateError(
        reason instanceof Error
          ? reason.message
          : "Le brouillon n'a pas pu être généré — réessayez.",
      )
    } finally {
      setGenerating(false)
    }
  }

  if (!aiEnabled) return null
  if (!loaded) return null

  const drafts = reminders.filter((r) => r.status === 'draft')
  const sent = reminders.filter((r) => r.status === 'sent')

  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
        Relances intelligentes
      </h2>
      <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
        Contenu adapté au comportement email et portail du client (non ouvert, ouvert/cliqué,
        étape bloquante). Le déclenchement suit vos règles de délai — l&apos;IA ne rédige que le
        contenu.
      </p>

      {generating ? (
        <p className="mt-4 text-sm font-body text-[var(--ink-muted)]" role="status">
          Génération du brouillon…
        </p>
      ) : null}

      {drafts.length > 0 ? (
        <div className="mt-4 space-y-3">
          {drafts.map((reminder) => (
            <DraftCard key={reminder.id} reminder={reminder} onProcessed={handleProcessed} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--surface-warm)]/50 p-4">
          <p className="text-sm font-body text-[var(--ink-soft)]">
            Aucune relance IA en attente. La prochaine sera générée automatiquement après le délai
            configuré, ou vous pouvez en créer une maintenant.
          </p>
          <span
            className="mt-3 inline-block"
            title={generateDisabledReason ?? undefined}
          >
            <Button
              variant="secondary"
              onClick={handleGenerateNow}
              disabled={generating || noClientAction}
            >
              {generating ? 'Génération du brouillon…' : 'Générer maintenant'}
            </Button>
          </span>
          {noClientAction ? (
            <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
              {generateDisabledReason}
            </p>
          ) : null}
          {generateError ? (
            <p className="mt-2 text-xs font-body text-[var(--amber)]">{generateError}</p>
          ) : null}
        </div>
      )}

      {sent.length > 0 ? (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Relances IA envoyées</p>
          <ul className="mt-2 space-y-2">
            {sent.map((reminder) => (
              <li
                key={reminder.id}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-body font-medium text-[var(--ink)]">{reminder.subject}</p>
                  <span className="text-xs font-body text-[var(--ink-muted)]">
                    {reminder.sent_at ? formatRelative(reminder.sent_at) : ''}
                  </span>
                </div>
                <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                  {BEHAVIOR_LABELS[reminder.behavior_category]}
                  {reminder.blocking_step_label ? ` · ${reminder.blocking_step_label}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}
