import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui'
import { ContractPreviewModal } from './ContractPreviewModal'
import {
  finalizeGeneratedDocument,
  previewGeneratedDocument,
  saveCurrentVersion,
  type DocumentSection,
  type DocumentVersion,
  type GeneratedDocumentRecord,
} from '../../lib/generatedDocuments'

type GeneratedDocumentEditorProps = {
  document: GeneratedDocumentRecord
  onFinalized: (contractTemplateId: string) => void
  onDeleted?: () => void
  onRegenerate?: () => void | Promise<void>
  regenerating?: boolean
  regenerateDisabled?: boolean
}

const ORIGIN_LABELS: Record<string, string> = {
  brief: 'Issu du brief',
  model: 'Issu de vos modèles',
  library: 'Bibliothèque de clauses',
  ai_generated: 'Rédigé par l’IA',
}

function LegalReviewBanner() {
  return (
    <p className="mt-2 rounded-[var(--radius-sm)] border border-[var(--amber)]/40 bg-[var(--amber-soft)] px-3 py-2 text-xs font-body font-medium text-[var(--amber)]">
      ⚠️ Clause rédigée par l&apos;IA sans source dans vos modèles — à faire valider par un
      professionnel du droit avant envoi.
    </p>
  )
}

export function GeneratedDocumentEditor({
  document,
  onFinalized,
  onDeleted,
  onRegenerate,
  regenerating = false,
  regenerateDisabled = false,
}: GeneratedDocumentEditorProps) {
  const [version, setVersion] = useState<DocumentVersion>(document.current_version)
  const [showAiVersion, setShowAiVersion] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isDraft = document.status === 'draft'

  useEffect(() => {
    setVersion(document.current_version)
    setShowAiVersion(false)
    setFeedback(null)
    setErrorMsg(null)
  }, [document.id, document.current_version])

  const hasManualEdits = useMemo(
    () => JSON.stringify(version) !== JSON.stringify(document.current_version),
    [version, document.current_version],
  )

  const updateSection = (sectionId: string, patch: Partial<DocumentSection>) => {
    setVersion((cur) => ({
      ...cur,
      sections: cur.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
    }))
  }

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    setVersion((cur) => {
      const index = cur.sections.findIndex((s) => s.id === sectionId)
      const target = index + direction
      if (index === -1 || target < 0 || target >= cur.sections.length) return cur
      const sections = [...cur.sections]
      ;[sections[index], sections[target]] = [sections[target], sections[index]]
      return { ...cur, sections }
    })
  }

  const removeSection = (sectionId: string) => {
    setVersion((cur) => ({ ...cur, sections: cur.sections.filter((s) => s.id !== sectionId) }))
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMsg(null)
    setFeedback(null)
    try {
      await saveCurrentVersion(document.id, version)
      setFeedback('Modifications enregistrées.')
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerate = async () => {
    if (!onRegenerate || regenerating || regenerateDisabled) return
    if (
      hasManualEdits &&
      !window.confirm(
        'Régénérer remplacera le brouillon actuel. Vos modifications manuelles seront perdues. Continuer ?',
      )
    ) {
      return
    }
    setErrorMsg(null)
    setFeedback(null)
    try {
      await onRegenerate()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Régénération impossible.')
    }
  }

  const handlePreview = async () => {
    setPreviewing(true)
    setErrorMsg(null)
    setFeedback(null)
    try {
      await saveCurrentVersion(document.id, version)
      const html = await previewGeneratedDocument(document.id, version)
      setPreviewHtml(html)
      setFeedback('Aperçu affiché — fermez la fenêtre pour revenir à l’édition.')
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Aperçu impossible.')
    } finally {
      setPreviewing(false)
    }
  }

  const handleFinalize = async () => {
    setFinalizing(true)
    setErrorMsg(null)
    setFeedback(null)
    try {
      await saveCurrentVersion(document.id, version)
      const { contractTemplateId } = await finalizeGeneratedDocument(document.id)
      setFeedback('Contrat finalisé : il est disponible pour signature par le client.')
      onFinalized(contractTemplateId)
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Finalisation impossible.')
    } finally {
      setFinalizing(false)
    }
  }

  const displayed = showAiVersion ? document.ai_version : version

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isDraft && !showAiVersion ? (
          <input
            type="text"
            value={version.title}
            onChange={(e) => setVersion((cur) => ({ ...cur, title: e.target.value }))}
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 font-display text-base font-semibold text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
          />
        ) : (
          <p className="font-display text-base font-semibold text-[var(--ink)]">{displayed.title}</p>
        )}
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-body font-medium ${
              isDraft
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'bg-[var(--mint-soft)] text-[var(--mint)]'
            }`}
          >
            {isDraft ? 'Brouillon' : 'Finalisé'}
          </span>
          <button
            type="button"
            onClick={() => setShowAiVersion((v) => !v)}
            className="text-xs font-body text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {showAiVersion ? 'Revenir à ma version' : 'Voir la version IA d’origine'}
          </button>
        </div>
      </div>

      <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
        Brief : {document.brief.length > 140 ? `${document.brief.slice(0, 140)}…` : document.brief}
      </p>

      <div className="mt-4 space-y-3">
        {displayed.sections.map((section, index) => (
          <div
            key={section.id}
            className={`rounded-[var(--radius-sm)] border p-3 ${
              section.needs_legal_review
                ? 'border-[var(--amber)]/40 bg-[var(--amber-soft)]/30'
                : 'border-[var(--border)] bg-[var(--surface)]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isDraft && !showAiVersion ? (
                <input
                  type="text"
                  value={section.heading}
                  onChange={(e) => updateSection(section.id, { heading: e.target.value })}
                  className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 text-sm font-body font-semibold text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                />
              ) : (
                <p className="text-sm font-body font-semibold text-[var(--ink)]">{section.heading}</p>
              )}
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-[var(--white)] px-2 py-0.5 text-[10px] font-body text-[var(--ink-muted)] ring-1 ring-[var(--border)]">
                  {ORIGIN_LABELS[section.origin] ?? section.origin}
                </span>
                {isDraft && !showAiVersion ? (
                  <>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, -1)}
                      disabled={index === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-muted)] transition hover:bg-[var(--white)] disabled:opacity-30"
                      aria-label="Monter la section"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, 1)}
                      disabled={index === displayed.sections.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-muted)] transition hover:bg-[var(--white)] disabled:opacity-30"
                      aria-label="Descendre la section"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSection(section.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[#EF4444] transition hover:bg-[#FEF2F2]"
                      aria-label="Supprimer la section"
                    >
                      ×
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {isDraft && !showAiVersion ? (
              <textarea
                value={section.content}
                onChange={(e) => updateSection(section.id, { content: e.target.value })}
                rows={Math.min(10, Math.max(3, section.content.split('\n').length + 1))}
                className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm font-body leading-relaxed text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
              />
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm font-body leading-relaxed text-[var(--ink-soft)]">
                {section.content}
              </p>
            )}

            {section.needs_legal_review ? <LegalReviewBanner /> : null}
          </div>
        ))}
      </div>

      {isDraft && !showAiVersion ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {onRegenerate ? (
            <Button
              variant="secondary"
              onClick={handleRegenerate}
              disabled={saving || finalizing || regenerating || regenerateDisabled}
            >
              {regenerating ? 'Régénération…' : 'Régénérer depuis le brief'}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={handlePreview}
            disabled={saving || finalizing || regenerating || previewing}
          >
            {previewing ? 'Aperçu…' : 'Aperçu mise en page'}
          </Button>
          <Button variant="secondary" onClick={handleSave} disabled={saving || finalizing || regenerating || previewing}>
            {saving ? 'Enregistrement…' : 'Enregistrer le brouillon'}
          </Button>
          <Button onClick={handleFinalize} disabled={saving || finalizing || regenerating || previewing}>
            {finalizing ? 'Génération du PDF…' : 'Finaliser en PDF pour signature'}
          </Button>
          {onDeleted ? (
            <button
              type="button"
              onClick={onDeleted}
              className="rounded-[var(--radius-sm)] px-3 py-2 text-sm font-body text-[#EF4444] transition hover:bg-[#FEF2F2]"
            >
              Supprimer
            </button>
          ) : null}
        </div>
      ) : null}

      {!isDraft ? (
        <p className="mt-4 text-xs font-body text-[var(--ink-muted)]">
          Ce document a rejoint vos modèles de contrat : liez-le à une étape « signature » de la
          checklist, ou ajustez la zone de signature dans « Modèles &amp; signature ».
        </p>
      ) : null}

      {feedback ? <p className="mt-2 text-sm font-body text-[var(--mint)]">{feedback}</p> : null}
      {errorMsg ? <p className="mt-2 text-sm font-body text-[var(--amber)]">{errorMsg}</p> : null}

      {previewHtml ? (
        <ContractPreviewModal
          html={previewHtml}
          title={`Aperçu — ${version.title}`}
          onClose={() => setPreviewHtml(null)}
        />
      ) : null}
    </div>
  )
}
