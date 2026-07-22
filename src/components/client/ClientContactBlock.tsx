import type { ReactNode } from 'react'
import {
  defaultMapsHref,
  formatClientAddress,
  mailtoHref,
  mapsAppleHref,
  mapsGoogleHref,
  telHref,
  wazeHref,
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
        {phone ? (
          <ContactRow label="Téléphone">
            <a
              href={telHref(phone)}
              className="text-[var(--accent)] underline-offset-2 hover:underline"
            >
              {phone}
            </a>
          </ContactRow>
        ) : null}
        {fullAddress ? (
          <ContactRow label="Adresse">
            <div className="space-y-2">
              <a
                href={defaultMapsHref(fullAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="block break-words text-[var(--accent)] underline-offset-2 hover:underline"
              >
                {fullAddress}
              </a>
              <div className="flex flex-wrap gap-2">
                <a
                  href={mapsAppleHref(fullAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ouvrir ${fullAddress} dans Plans`}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-2.5 text-xs font-body font-semibold text-[var(--ink-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Plans
                </a>
                <a
                  href={mapsGoogleHref(fullAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ouvrir ${fullAddress} dans Google Maps`}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-2.5 text-xs font-body font-semibold text-[var(--ink-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Maps
                </a>
                <a
                  href={wazeHref(fullAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ouvrir ${fullAddress} dans Waze`}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-2.5 text-xs font-body font-semibold text-[var(--ink-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Waze
                </a>
              </div>
            </div>
          </ContactRow>
        ) : null}
      </dl>
    </div>
  )
}
