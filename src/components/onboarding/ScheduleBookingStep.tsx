import { useEffect, useMemo, useRef } from 'react'
import { Button } from '../ui'
import {
  getScheduleProvider,
  isScheduleBookingMessage,
  toScheduleEmbedUrl,
} from '../../lib/scheduleEmbed'

type ScheduleBookingStepProps = {
  scheduleUrl: string | null | undefined
  agencyName: string
  isSaving: boolean
  onConfirm: () => void
}

/**
 * Étape portail « Prise de rendez-vous » : calendrier embarqué (Calendly / Cal.com)
 * quand c'est possible, sinon lien externe. La confirmation se fait automatiquement
 * après réservation (postMessage), avec un secours manuel.
 */
export function ScheduleBookingStep({
  scheduleUrl,
  agencyName,
  isSaving,
  onConfirm,
}: ScheduleBookingStepProps) {
  const bookingUrl = (scheduleUrl ?? '').trim()
  const embedUrl = useMemo(() => toScheduleEmbedUrl(bookingUrl), [bookingUrl])
  const provider = useMemo(() => getScheduleProvider(bookingUrl), [bookingUrl])
  const canEmbed = Boolean(embedUrl)
  const confirmedRef = useRef(false)
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm

  const confirmOnce = () => {
    if (confirmedRef.current || isSaving) return
    confirmedRef.current = true
    onConfirmRef.current()
  }

  useEffect(() => {
    if (!canEmbed) return

    const onMessage = (event: MessageEvent) => {
      if (!isScheduleBookingMessage(event.data)) return
      if (confirmedRef.current) return
      confirmedRef.current = true
      onConfirmRef.current()
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [canEmbed])

  if (!bookingUrl) {
    return (
      <p className="font-body text-sm text-[var(--amber)]">
        Lien de réservation manquant — contactez {agencyName}.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="font-body text-sm text-[var(--ink-muted)]">
        {canEmbed
          ? "Choisissez un créneau ci-dessous. L'étape se confirmera automatiquement après la réservation."
          : 'Ouvrez le lien pour choisir un créneau, puis confirmez cette étape.'}
      </p>

      {canEmbed && embedUrl ? (
        <iframe
          src={embedUrl}
          title="Réserver un créneau"
          loading="lazy"
          className="h-[min(640px,70vh)] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)]"
        />
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <a
          href={bookingUrl}
          target="_blank"
          rel="noreferrer"
          className={
            canEmbed
              ? 'inline-flex items-center font-body text-sm text-[var(--accent)] underline'
              : 'inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-6 py-3 font-body text-sm font-medium text-[var(--white)] transition hover:brightness-95'
          }
        >
          {canEmbed
            ? 'Ouvrir dans un nouvel onglet →'
            : '📅 Réserver un créneau →'}
        </a>

        {/* Secours manuel : certains widgets (ou bloqueurs) n'émettent pas le postMessage. */}
        <Button variant="secondary" onClick={confirmOnce} disabled={isSaving}>
          {isSaving ? 'Enregistrement...' : "J'ai réservé mon créneau"}
        </Button>
      </div>

      {provider === 'other' ? (
        <p className="font-body text-xs text-[var(--ink-muted)]">
          Pour un calendrier intégré au portail, utilisez un lien Calendly ou Cal.com.
        </p>
      ) : null}
    </div>
  )
}
