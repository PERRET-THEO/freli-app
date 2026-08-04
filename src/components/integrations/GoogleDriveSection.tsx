import { Card } from '../ui'

type Props = {
  connected: boolean
  isSaving: boolean
  googleEmail: string | undefined
  googleError: string | null
  onConnect: () => void
  onDisconnect: () => void
}

export function GoogleDriveSection({
  connected,
  isSaving,
  googleEmail,
  googleError,
  onConnect,
  onDisconnect,
}: Props) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📁</span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Google Drive</h2>
              {connected && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-body font-medium bg-[var(--mint-soft)] text-[var(--mint)]">
                  Connecté
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
              Créez automatiquement un dossier client dans votre Drive.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
          <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Comment ça marche</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs font-body text-[var(--ink-muted)]">
            <li>Connectez votre compte Google (OAuth).</li>
            <li>
              À la fin de l&apos;onboarding client, Freli crée un dossier{' '}
              <strong>Clients / Nom du client</strong> et y dépose{' '}
              <strong>les documents, contrats signés et un récap checklist</strong>.
            </li>
            <li>Le lien du dossier apparaît sur la fiche projet.</li>
          </ol>
        </div>
        {googleEmail && (
          <p className="text-xs font-body text-[var(--ink-muted)]">
            Compte Google : {googleEmail}
          </p>
        )}
        {googleError ? (
          <p className="text-sm font-body text-[var(--amber)]">{googleError}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={onConnect}
              className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95 disabled:opacity-50"
            >
              {isSaving ? '...' : 'Connecter Google Drive'}
            </button>
          ) : (
            <button
              type="button"
              disabled={isSaving}
              onClick={onDisconnect}
              className="rounded-[var(--radius-sm)] border border-[#EF4444] bg-transparent px-5 py-2.5 text-sm font-body font-medium text-[#EF4444] transition hover:bg-[#FEF2F2] disabled:opacity-50"
            >
              Déconnecter Google Drive
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}
