import { formatPhoneDisplay, mailtoHref, parseAgencyPhone } from '../../lib/contactLinks'

type PortalContactLinksProps = {
  email?: string | null
  phone?: string | null
  /** Nom du projet pour le sujet mailto */
  projectName?: string | null
  className?: string
}

export function PortalContactLinks({
  email,
  phone,
  projectName,
  className = '',
}: PortalContactLinksProps) {
  const trimmedEmail = email?.trim() || ''
  const parsedPhone = parseAgencyPhone(phone)
  const phoneDisplay = formatPhoneDisplay(phone)

  if (!trimmedEmail && !parsedPhone) return null

  const subject = projectName?.trim()
    ? `Projet ${projectName.trim()}`
    : undefined

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`.trim()}>
      {trimmedEmail ? (
        <a
          href={mailtoHref(trimmedEmail, subject)}
          aria-label={`Envoyer un email à ${trimmedEmail}`}
          className="inline-flex min-h-11 items-center justify-center px-3 font-body text-xs text-[var(--ink-muted)] underline-offset-2 transition hover:text-[var(--portal-accent,var(--accent))] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--portal-accent,var(--accent))]"
        >
          {trimmedEmail}
        </a>
      ) : null}
      {parsedPhone && phoneDisplay ? (
        <a
          href={`tel:${parsedPhone.e164}`}
          aria-label={`Appeler le ${phoneDisplay}`}
          className="inline-flex min-h-11 items-center justify-center px-3 font-body text-xs text-[var(--ink-muted)] underline-offset-2 transition hover:text-[var(--portal-accent,var(--accent))] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--portal-accent,var(--accent))]"
        >
          {phoneDisplay}
        </a>
      ) : null}
    </div>
  )
}
