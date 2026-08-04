import { PortalContactLinks } from './PortalContactLinks'

type PortalFooterProps = {
  showHelpBlock: boolean
  portalHelpTitle: string
  portalHelpText: string
  portalAvailability: string
  agencyContactEmail: string
  agencyContactPhone: string
  projectName: string
}

export function PortalFooter({
  showHelpBlock,
  portalHelpTitle,
  portalHelpText,
  portalAvailability,
  agencyContactEmail,
  agencyContactPhone,
  projectName,
}: PortalFooterProps) {
  return (
    <footer className="pb-8 text-center">
      {showHelpBlock ? (
        <div className="mb-4 px-4">
          <p className="font-display text-sm font-semibold text-[var(--ink)]">{portalHelpTitle}</p>
          {portalHelpText ? (
            <p className="mx-auto mt-1 max-w-md font-body text-xs text-[var(--ink-muted)]">
              {portalHelpText}
            </p>
          ) : null}
          {portalAvailability ? (
            <p className="mt-1 font-body text-xs text-[var(--ink-muted)]">{portalAvailability}</p>
          ) : null}
          <PortalContactLinks
            email={agencyContactEmail}
            phone={agencyContactPhone}
            projectName={projectName}
            className="mt-2"
          />
        </div>
      ) : null}
      <p className="font-body text-xs text-[var(--ink-muted)]">
        Propulsé par{' '}<span className="font-display font-bold text-[var(--ink)]">Freli</span>
      </p>
    </footer>
  )
}
