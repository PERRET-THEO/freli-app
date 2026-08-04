import { useRef } from 'react'
import { BrandColorPicker } from './BrandColorPicker'
import { LogoUpload } from './LogoUpload'
import { PortalPreviewLink } from './PortalPreviewLink'
import { Button, Input } from '../ui'
import type { PortalPreviewData } from '../../lib/agencyBranding'
import {
  DEFAULT_PORTAL_WELCOME,
  insertWelcomeVariable,
  PORTAL_WELCOME_VARIABLES,
} from '../../lib/portalWelcomeTemplate'

type SectionFeedback = { type: 'success' | 'error'; text: string } | null

type PortalBrandingPanelProps = {
  logoCurrentUrl: string | null
  logoFile: File | null
  onLogoFileChange: (file: File | null) => void
  onLogoError: (error: string | null) => void
  logoError: string | null
  tagline: string
  onTaglineChange: (value: string) => void
  welcomeMessage: string
  onWelcomeMessageChange: (value: string) => void
  brandColor: string
  onBrandColorChange: (value: string) => void
  contactEmail: string
  onContactEmailChange: (value: string) => void
  contactPhone: string
  onContactPhoneChange: (value: string) => void
  portfolioUrl: string
  onPortfolioUrlChange: (value: string) => void
  portfolioLabel: string
  onPortfolioLabelChange: (value: string) => void
  helpTitle: string
  onHelpTitleChange: (value: string) => void
  helpText: string
  onHelpTextChange: (value: string) => void
  availability: string
  onAvailabilityChange: (value: string) => void
  previewData: PortalPreviewData
  onSave: () => void
  saving: boolean
  feedback: SectionFeedback
}

export function PortalBrandingPanel({
  logoCurrentUrl,
  logoFile,
  onLogoFileChange,
  onLogoError,
  logoError,
  tagline,
  onTaglineChange,
  welcomeMessage,
  onWelcomeMessageChange,
  brandColor,
  onBrandColorChange,
  contactEmail,
  onContactEmailChange,
  contactPhone,
  onContactPhoneChange,
  portfolioUrl,
  onPortfolioUrlChange,
  portfolioLabel,
  onPortfolioLabelChange,
  helpTitle,
  onHelpTitleChange,
  helpText,
  onHelpTextChange,
  availability,
  onAvailabilityChange,
  previewData,
  onSave,
  saving,
  feedback,
}: PortalBrandingPanelProps) {
  const welcomeTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  return (
    <div className="space-y-4">
      <LogoUpload
        currentUrl={logoCurrentUrl}
        file={logoFile}
        onFileChange={onLogoFileChange}
        onError={onLogoError}
      />
      {logoError ? (
        <p className="text-sm font-body text-[var(--amber)]">{logoError}</p>
      ) : null}
      <Input
        placeholder="Sous-titre (ex. Studio créatif à Paris)"
        value={tagline}
        onChange={(event) => onTaglineChange(event.target.value)}
      />
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label className="block text-sm font-body font-medium text-[var(--ink-soft)]">
            Message d&apos;accueil
          </label>
          <label className="flex items-center gap-1.5 text-xs font-body text-[var(--ink-muted)]">
            Insérer
            <select
              className="rounded border border-[var(--border)] bg-[var(--white)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              defaultValue=""
              onChange={(event) => {
                const token = event.target.value
                if (!token) return
                const el = welcomeTextareaRef.current
                const cursor = el?.selectionStart ?? welcomeMessage.length
                onWelcomeMessageChange(insertWelcomeVariable(welcomeMessage, token, cursor))
                event.target.value = ''
                requestAnimationFrame(() => {
                  if (!el) return
                  const next = cursor + token.length
                  el.focus()
                  el.setSelectionRange(next, next)
                })
              }}
              aria-label="Insérer une variable"
            >
              <option value="" disabled>
                Variable…
              </option>
              {PORTAL_WELCOME_VARIABLES.map((v) => (
                <option key={v.key} value={v.token}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          ref={welcomeTextareaRef}
          value={welcomeMessage}
          onChange={(event) => onWelcomeMessageChange(event.target.value)}
          placeholder={DEFAULT_PORTAL_WELCOME}
          rows={3}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
        />
        <p className="mt-1 break-all text-xs font-body text-[var(--ink-muted)]">
          Variables : {'{{client.prenom}}'}, {'{{client.entreprise}}'}, {'{{projet.nom}}'},{' '}
          {'{{agence.nom}}'}
        </p>
      </div>
      <BrandColorPicker value={brandColor} onChange={onBrandColorChange} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          type="email"
          placeholder="Email de contact (optionnel)"
          value={contactEmail}
          onChange={(event) => onContactEmailChange(event.target.value)}
        />
        <Input
          type="tel"
          placeholder="Téléphone (optionnel)"
          value={contactPhone}
          onChange={(event) => onContactPhoneChange(event.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          type="url"
          placeholder="Portfolio https://… (optionnel)"
          value={portfolioUrl}
          onChange={(event) => onPortfolioUrlChange(event.target.value)}
        />
        <Input
          placeholder="Libellé du bouton portfolio"
          value={portfolioLabel}
          onChange={(event) => onPortfolioLabelChange(event.target.value)}
        />
      </div>
      <div className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-warm)] p-4">
        <p className="text-sm font-body font-medium text-[var(--ink-soft)]">
          Bloc « Besoin d&apos;aide ? »
        </p>
        <Input
          placeholder="Titre"
          value={helpTitle}
          onChange={(event) => onHelpTitleChange(event.target.value)}
        />
        <textarea
          value={helpText}
          onChange={(event) => onHelpTextChange(event.target.value)}
          placeholder="Texte d'accompagnement (optionnel)"
          rows={2}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
        />
        <Input
          placeholder="Horaires (ex. Lun–Ven 9h–18h)"
          value={availability}
          onChange={(event) => onAvailabilityChange(event.target.value)}
        />
      </div>
      <PortalPreviewLink data={previewData} />
      <Button onClick={onSave} disabled={saving}>
        {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
      </Button>
      {feedback ? (
        <p
          className={`text-sm font-body ${
            feedback.type === 'success' ? 'text-[var(--mint)]' : 'text-[var(--amber)]'
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  )
}
