import type { ReactNode } from 'react'
import {
  defaultMapsHref,
  formatClientAddress,
  formatPhoneDisplay,
  isNavigableAddress,
  mailtoHref,
  telHref,
  type ClientAddressParts,
} from '../../lib/contactLinks'

type ClientContactBlockProps = {
  email: string
  phone?: string | null
  address?: ClientAddressParts | null
  companyName?: string | null
}

function ContactRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-11 items-start gap-3 text-sm font-body">
      <dt className="w-20 shrink-0 pt-0.5 text-[var(--ink-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[var(--ink)]">{children}</dd>
    </div>
  )
}

export function ClientContactBlock({
  email,
  phone,
  address,
  companyName,
}: ClientContactBlockProps) {
  const fullAddress = address ? formatClientAddress(address) : null
  const navigable = address ? isNavigableAddress(address) : false
  const phoneDisplay = formatPhoneDisplay(phone)

  return (
    <div className="border-b border-[var(--border)] pb-5">
      <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Contact</p>
      <dl className="mt-3 space-y-2">
        {companyName ? (
          <ContactRow label="Entreprise">
            <span className="font-semibold text-[var(--ink)]">{companyName}</span>
          </ContactRow>
        ) : null}
        <ContactRow label="Email">
          <a
            href={mailtoHref(email)}
            className="break-all text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {email}
          </a>
        </ContactRow>
        {phoneDisplay ? (
          <ContactRow label="Téléphone">
            <a
              href={telHref(phone ?? phoneDisplay)}
              className="text-[var(--accent)] underline-offset-2 hover:underline"
            >
              {phoneDisplay}
            </a>
          </ContactRow>
        ) : null}
        {fullAddress ? (
          <ContactRow label="Adresse">
            <div className="space-y-2">
              {navigable ? (
                <>
                  <p className="break-words">{fullAddress}</p>
                  <a
                    href={defaultMapsHref(fullAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Itinéraire vers ${fullAddress}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 text-xs font-body font-semibold text-[var(--ink-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    Itinéraire
                  </a>
                </>
              ) : (
                <span className="break-words text-[var(--ink-muted)]">{fullAddress}</span>
              )}
            </div>
          </ContactRow>
        ) : null}
      </dl>
    </div>
  )
}
