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

type SmartRemindersPanelProps = {
  projectId: string
  aiEnabled?: boolean
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
  onSent,
  onRequestGenerate,
}: SmartRemindersPanelProps) {
  const [reminders, setReminders] = useState<SmartReminderRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const load = async () => {
    try {
      setReminders(await fetchProjectSmartReminders(projectId))
    } catch {
      // table absente ou erreur réseau : la section reste vide
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const handleProcessed = () => {
    void load()
    onSent?.()
  }

  const handleGenerateNow = async () => {
    setGenerating(true)
    setGenerateError(null)
    try {
      if (onRequestGenerate) {
        await onRequestGenerate()
      } else {
        await requestSmartReminder(projectId)
      }
      await load()
      onSent?.()
    } catch (reason) {
      setGenerateError(
        reason instanceof Error ? reason.message : 'Impossible de générer la relance IA.',
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
          <Button
            className="mt-3"
            variant="secondary"
            onClick={handleGenerateNow}
            disabled={generating}
          >
            {generating ? 'Génération…' : 'Générer maintenant'}
          </Button>
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
