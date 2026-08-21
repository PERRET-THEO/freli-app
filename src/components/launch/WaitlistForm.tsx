import { useId, useState, type FormEvent } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { Button, Input } from '../ui'
import { launchPageUrl } from '../../lib/launchSite'
import { siteConfig } from '../../lib/seo/siteConfig'
import {
  isValidWaitlistEmail,
  isValidWaitlistFirstName,
} from '../../lib/waitlistValidation'
import { submitWaitlistSignup } from '../../lib/waitlistSignup'

const PRIVACY_URL = `${siteConfig.siteUrl}/confidentialite`

type FieldErrors = {
  firstName?: string
  email?: string
  consent?: string
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'already'

export function WaitlistForm({ idPrefix = 'waitlist' }: { idPrefix?: string }) {
  const firstNameId = useId()
  const emailId = useId()
  const consentId = useId()
  const firstNameErrorId = `${firstNameId}-error`
  const emailErrorId = `${emailId}-error`
  const consentErrorId = `${consentId}-error`

  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<FormStatus>('idle')
  const [formError, setFormError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const validate = (): FieldErrors => {
    const next: FieldErrors = {}
    if (!isValidWaitlistFirstName(firstName)) {
      next.firstName = 'Merci d’indiquer votre prénom'
    }
    if (!isValidWaitlistEmail(email)) {
      next.email = 'Merci d’indiquer un email valide'
    }
    if (!consent) {
      next.consent = 'Merci de cocher la case pour recevoir l’email d’ouverture'
    }
    return next
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    if (honeypot.trim()) {
      setStatus('success')
      return
    }

    setStatus('submitting')
    const result = await submitWaitlistSignup({
      firstName: firstName.trim(),
      email,
      consent,
    })
    if (!result.ok) {
      setStatus('idle')
      setFormError(result.error)
      return
    }
    setStatus(result.alreadyRegistered ? 'already' : 'success')
  }

  const shareUrl = launchPageUrl()
  const shareText = 'Freli arrive bientôt — onboarding client automatisé pour freelances et agences.'

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const shareLinkClass =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-6 py-3 font-body text-sm font-medium text-[var(--ink)] transition hover:border-[var(--accent)]'

  if (status === 'success' || status === 'already') {
    const displayName = firstName.trim() || 'vous'
    return (
      <div
        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--accent-soft)] px-4 py-5 sm:px-5"
        role="status"
        aria-live="polite"
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--mint-soft)] text-[var(--mint)]">
          <Check className="h-5 w-5" aria-hidden />
        </div>
        <p className="font-display text-lg font-bold text-[var(--ink)]">
          {status === 'already'
            ? 'Vous êtes déjà inscrit·e, à bientôt !'
            : `C’est noté, ${displayName} !`}
        </p>
        <p className="mt-1 font-body text-sm leading-relaxed text-[var(--ink-muted)]">
          {status === 'already'
            ? 'Votre email est déjà sur la liste. Vous recevrez un message dès l’ouverture.'
            : 'Vous recevrez un email dès l’ouverture publique de Freli.'}
        </p>
        <p className="mt-4 font-body text-sm font-medium text-[var(--ink)]">
          Partagez Freli à un confrère — plus on est nombreux au lancement, mieux c’est.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" className="min-h-11 gap-2" onClick={() => void copyShareLink()}>
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? 'Lien copié' : 'Copier le lien'}
          </Button>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noreferrer"
            className={shareLinkClass}
          >
            <Share2 className="h-4 w-4" aria-hidden />
            LinkedIn
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noreferrer"
            className={shareLinkClass}
          >
            Partager sur X
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="relative flex flex-col gap-3.5">
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor={`${idPrefix}-website`}>Site web</label>
        <input
          id={`${idPrefix}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label htmlFor={firstNameId} className="mb-1 block font-body text-xs text-[var(--ink-muted)]">
            Prénom
          </label>
          <Input
            id={firstNameId}
            name="given-name"
            type="text"
            autoComplete="given-name"
            required
            minLength={1}
            maxLength={80}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            aria-invalid={Boolean(errors.firstName)}
            aria-describedby={errors.firstName ? firstNameErrorId : undefined}
            className="min-h-11"
          />
          {errors.firstName ? (
            <p id={firstNameErrorId} className="mt-1 font-body text-xs text-[var(--amber)]" role="alert">
              {errors.firstName}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={emailId} className="mb-1 block font-body text-xs text-[var(--ink-muted)]">
            Email
          </label>
          <Input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? emailErrorId : undefined}
            className="min-h-11"
            placeholder="vous@agence.fr"
          />
          {errors.email ? (
            <p id={emailErrorId} className="mt-1 font-body text-xs text-[var(--amber)]" role="alert">
              {errors.email}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor={consentId} className="flex cursor-pointer items-start gap-3">
          <input
            id={consentId}
            name="consent"
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-[var(--border)] text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? consentErrorId : undefined}
          />
          <span className="font-body text-sm leading-relaxed text-[var(--ink-soft)]">
            J’accepte de recevoir un email de Freli lors de l’ouverture publique du service.{' '}
            <a href={PRIVACY_URL} className="text-[var(--accent)] hover:underline">
              Politique de confidentialité
            </a>
            .
          </span>
        </label>
        {errors.consent ? (
          <p id={consentErrorId} className="mt-1 font-body text-xs text-[var(--amber)]" role="alert">
            {errors.consent}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p className="font-body text-sm text-[var(--amber)]" role="alert" aria-live="polite">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={status === 'submitting'} className="min-h-11 w-full">
        {status === 'submitting' ? 'Envoi…' : 'Réserver ma place'}
      </Button>

      <p className="font-body text-xs leading-relaxed text-[var(--ink-muted)]">
        Freli collecte votre prénom et votre email uniquement pour vous prévenir du lancement
        public du service. Vous pouvez vous désinscrire à tout moment via le lien présent dans
        chaque email.
      </p>
    </form>
  )
}
