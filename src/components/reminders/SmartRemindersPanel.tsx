import { useEffect, useState } from 'react'
import { Button, Card } from '../ui'
import { formatRelative } from '../../lib/formatRelative'
import {
  BEHAVIOR_LABELS,
  dismissSmartReminder,
  fetchProjectSmartReminders,
  sendSmartReminder,
  type SmartReminderRecord,
} from '../../lib/smartReminders'

type SmartRemindersPanelProps = {
  projectId: string
  onSent?: () => void
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

export function SmartRemindersPanel({ projectId, onSent }: SmartRemindersPanelProps) {
  const [reminders, setReminders] = useState<SmartReminderRecord[]>([])
  const [loaded, setLoaded] = useState(false)

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

  if (!loaded || reminders.length === 0) return null

  const drafts = reminders.filter((r) => r.status === 'draft')
  const sent = reminders.filter((r) => r.status === 'sent')

  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
        ✨ Relances intelligentes
      </h2>
      <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
        Contenu rédigé par l&apos;IA selon le comportement du client. Le déclenchement suit vos
        règles de relance, jamais une décision opaque.
      </p>

      {drafts.length > 0 ? (
        <div className="mt-4 space-y-3">
          {drafts.map((reminder) => (
            <DraftCard key={reminder.id} reminder={reminder} onProcessed={handleProcessed} />
          ))}
        </div>
      ) : null}

      {sent.length > 0 ? (
        <div className={drafts.length > 0 ? 'mt-5 border-t border-[var(--border)] pt-4' : 'mt-4'}>
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
