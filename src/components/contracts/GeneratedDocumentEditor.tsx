import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../ui'
import { ContractPreviewModal } from './ContractPreviewModal'
import { PdfSignaturePositionEditor } from './PdfSignaturePositionEditor'
import { SignatureFocusOverlay } from './SignatureFocusOverlay'
import { ContractGenerationStepper } from './ContractGenerationStepper'
import { ContractProjectSummaryBanner } from './ContractProjectSummaryBanner'
import { ContractSectionAccordion } from './ContractSectionAccordion'
import { ContractReviewRail } from './ContractReviewRail'
import { ContractReviewChecklist } from './ContractReviewChecklist'
import { resolveAgencyContractPdfUrl } from '../../lib/contractStorage'
import type { ContractProjectContext } from '../../lib/contractProjectContext'
import {
  deriveContractFlowStep,
  deriveUiPhase,
  isReviewChecklistComplete,
  isSectionEdited,
  splitDocumentSections,
  type ReviewChecklistItemId,
  type ReviewChecklistStatus,
} from '../../lib/contractSectionUtils'
import {
  finalizeGeneratedDocument,
  previewGeneratedDocument,
  saveCurrentVersion,
  updateGeneratedDocumentSignature,
  type DocumentSection,
  type DocumentVersion,
  type GeneratedDocumentRecord,
} from '../../lib/generatedDocuments'

type GeneratedDocumentEditorProps = {
  document: GeneratedDocumentRecord
  projectContext?: ContractProjectContext | null
  onFinalized: (documentId: string) => void
  onPdfCreated?: (documentId: string) => void
  onDeleted?: () => void
  onRegenerate?: () => void | Promise<void>
  regenerating?: boolean
  regenerateDisabled?: boolean
  signatureConfirmLabel?: string
}

export function GeneratedDocumentEditor({
  document,
  projectContext,
  onFinalized,
  onPdfCreated,
  onDeleted,
  onRegenerate,
  regenerating = false,
  regenerateDisabled = false,
  signatureConfirmLabel = 'Enregistrer la position de signature',
}: GeneratedDocumentEditorProps) {
  const [version, setVersion] = useState<DocumentVersion>(document.current_version)
  const [showAiVersion, setShowAiVersion] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState(document.status)
  const [pdfPath, setPdfPath] = useState(document.pdf_storage_path)
  const [needsSignaturePlacement, setNeedsSignaturePlacement] = useState(false)
  const [openingPdf, setOpeningPdf] = useState(false)
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null)
  const [highlightSectionId, setHighlightSectionId] = useState<string | null>(null)
  const [showReviewGate, setShowReviewGate] = useState(false)
  const [reviewChecklist, setReviewChecklist] = useState<
    Partial<Record<ReviewChecklistItemId, ReviewChecklistStatus>>
  >({})
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const isDraft = localStatus === 'draft'
  const displayed = showAiVersion ? document.ai_version : version
  const { mergeSections, bodySections: editableBodySections } = useMemo(
    () => splitDocumentSections(displayed.sections),
    [displayed.sections],
  )

  const flaggedSections = useMemo(
    () => editableBodySections.filter((s) => s.needs_legal_review),
    [editableBodySections],
  )

  const uiPhase = deriveUiPhase(localStatus, showReviewGate)
  const flowStep = deriveContractFlowStep({
    status: localStatus,
    hasPdf: Boolean(pdfPath),
    needsSignaturePlacement,
  })

  const checklistComplete = isReviewChecklistComplete(reviewChecklist, editableBodySections)
  const canFinalize = !showReviewGate || checklistComplete

  useEffect(() => {
    setVersion(document.current_version)
    setShowAiVersion(false)
    setFeedback(null)
    setErrorMsg(null)
    setLocalStatus(document.status)
    setPdfPath(document.pdf_storage_path)
    setShowReviewGate(false)
    setReviewChecklist({})
    const firstBody = splitDocumentSections(document.current_version.sections).bodySections[0]
    setExpandedSectionId(firstBody?.id ?? null)
  }, [document.id, document.current_version, document.status, document.pdf_storage_path])

  const updateSection = (sectionId: string, patch: Partial<DocumentSection>) => {
    setVersion((cur) => ({
      ...cur,
      sections: cur.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
    }))
  }

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    setVersion((cur) => {
      const bodyIds = splitDocumentSections(cur.sections).bodySections.map((s) => s.id)
      const index = bodyIds.indexOf(sectionId)
      const target = index + direction
      if (index === -1 || target < 0 || target >= bodyIds.length) return cur
      const sections = [...cur.sections]
      const idA = bodyIds[index]
      const idB = bodyIds[target]
      const idxA = sections.findIndex((s) => s.id === idA)
      const idxB = sections.findIndex((s) => s.id === idB)
      ;[sections[idxA], sections[idxB]] = [sections[idxB], sections[idxA]]
      return { ...cur, sections }
    })
  }

  const removeSection = (sectionId: string) => {
    setVersion((cur) => ({ ...cur, sections: cur.sections.filter((s) => s.id !== sectionId) }))
    if (expandedSectionId === sectionId) setExpandedSectionId(null)
  }

  const revertSectionToAi = (sectionId: string) => {
    const aiSection = document.ai_version.sections.find((s) => s.id === sectionId)
    if (!aiSection) return
    const edited = isSectionEdited(sectionId, version, document.ai_version)
    if (
      edited &&
      !window.confirm(
        'Réinitialiser cette section depuis la version IA ? Vos modifications seront perdues.',
      )
    ) {
      return
    }
    updateSection(sectionId, { heading: aiSection.heading, content: aiSection.content })
  }

  const jumpToSection = useCallback((sectionId: string) => {
    setExpandedSectionId(sectionId)
    setHighlightSectionId(sectionId)
    window.setTimeout(() => {
      sectionRefs.current[sectionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    window.setTimeout(() => setHighlightSectionId(null), 2000)
  }, [])

  const handleRegenerate = async () => {
    if (!onRegenerate || regenerating || regenerateDisabled) return
    if (
      editableBodySections.some((s) => isSectionEdited(s.id, version, document.ai_version)) &&
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

  const handlePreview = async () => {
    setPreviewing(true)
    setErrorMsg(null)
    setFeedback(null)
    try {
      await saveCurrentVersion(document.id, version)
      const html = await previewGeneratedDocument(document.id, version)
      setPreviewHtml(html)
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Aperçu impossible.')
    } finally {
      setPreviewing(false)
    }
  }

  const handleRequestFinalize = () => {
    if (!showReviewGate) {
      setShowReviewGate(true)
      return
    }
    if (!checklistComplete) return
    void handleFinalize()
  }

  const handleFinalize = async () => {
    setFinalizing(true)
    setErrorMsg(null)
    setFeedback(null)
    try {
      await saveCurrentVersion(document.id, version)
      const { documentId, storagePath } = await finalizeGeneratedDocument(document.id)
      setLocalStatus('finalized')
      setPdfPath(storagePath)
      setNeedsSignaturePlacement(true)
      setShowReviewGate(false)
      setFeedback('PDF généré — positionnez la zone de signature.')
      onPdfCreated?.(documentId)
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Finalisation impossible.')
    } finally {
      setFinalizing(false)
    }
  }

  const handleSignatureSaved = async (position: {
    signature_page: number
    signature_x: number
    signature_y: number
    signature_width: number
    signature_height: number
  }) => {
    await updateGeneratedDocumentSignature(document.id, position)
    setNeedsSignaturePlacement(false)
    setFeedback(
      signatureConfirmLabel.includes('envoyer')
        ? 'Position de signature enregistrée — invitation en cours d’envoi.'
        : 'Position de signature enregistrée.',
    )
    onFinalized(document.id)
  }

  const handleOpenPdf = async () => {
    if (!pdfPath) return
    setOpeningPdf(true)
    setErrorMsg(null)
    try {
      const url = await resolveAgencyContractPdfUrl(pdfPath)
      if (!url) throw new Error('URL PDF indisponible')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Ouverture du PDF impossible.')
    } finally {
      setOpeningPdf(false)
    }
  }

  const extraMeta = mergeSections
    .filter((s) => !['DE', 'POUR', 'DATE'].some((k) => s.heading.toUpperCase().startsWith(k)))
    .map((s) => ({ label: s.heading, value: s.content.split('\n')[0] ?? s.content }))

  const shellClass =
    uiPhase === 'draft'
      ? 'border-[var(--border)] bg-[var(--surface)]/40'
      : uiPhase === 'reviewable'
        ? 'border-[var(--amber)]/25 bg-[var(--amber-soft)]/5'
        : 'border-[var(--mint)]/25 bg-[var(--white)]'

  return (
    <div className={`w-full min-w-0 rounded-[var(--radius-sm)] border p-3 sm:p-4 ${shellClass}`}>
      <ContractGenerationStepper activeStep={flowStep} uiPhase={uiPhase} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {isDraft && !showAiVersion ? (
          <input
            type="text"
            value={version.title}
            onChange={(e) => setVersion((cur) => ({ ...cur, title: e.target.value }))}
            aria-label="Titre du contrat"
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 font-display text-base font-semibold text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
          />
        ) : (
          <p className="font-display text-base font-semibold text-[var(--ink)]">{displayed.title}</p>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-body font-medium ${
            isDraft
              ? uiPhase === 'reviewable'
                ? 'bg-[var(--amber-soft)] text-[var(--amber)]'
                : 'bg-[var(--accent-soft)] text-[var(--accent)]'
              : 'bg-[var(--mint-soft)] text-[var(--mint)]'
          }`}
        >
          {isDraft ? (uiPhase === 'reviewable' ? 'À finaliser' : 'Brouillon') : 'Finalisé'}
        </span>
      </div>

      {isDraft ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-body text-[var(--ink-muted)] underline-offset-2 hover:underline">
            Voir le brief et la version IA d&apos;origine
          </summary>
          <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
            Brief : {document.brief.length > 200 ? `${document.brief.slice(0, 200)}…` : document.brief}
          </p>
          <button
            type="button"
            onClick={() => setShowAiVersion((v) => !v)}
            className="mt-1 text-xs font-body text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {showAiVersion ? 'Revenir à ma version' : 'Afficher la version IA d’origine'}
          </button>
          {onRegenerate ? (
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={regenerating || regenerateDisabled}
              className="mt-2 block text-xs font-body text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              {regenerating ? 'Régénération…' : 'Régénérer tout le brouillon depuis le brief'}
            </button>
          ) : null}
        </details>
      ) : null}

      {isDraft && projectContext ? (
        <div className="mt-4">
          <ContractProjectSummaryBanner context={projectContext} extraMeta={extraMeta} />
        </div>
      ) : null}

      {isDraft ? (
        <div className="mt-4 md:grid md:grid-cols-[minmax(0,1fr)_220px] md:gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-2">
            {editableBodySections.map((section, index) => (
              <ContractSectionAccordion
                key={section.id}
                section={section}
                index={index}
                total={editableBodySections.length}
                expanded={expandedSectionId === section.id}
                readOnly={showAiVersion}
                isEdited={isSectionEdited(section.id, version, document.ai_version)}
                highlighted={highlightSectionId === section.id}
                onToggle={() =>
                  setExpandedSectionId((cur) => (cur === section.id ? null : section.id))
                }
                onChange={(patch) => updateSection(section.id, patch)}
                onMove={(dir) => moveSection(section.id, dir)}
                onRemove={() => removeSection(section.id)}
                onRevertToAi={() => revertSectionToAi(section.id)}
                sectionRef={(el) => {
                  sectionRefs.current[section.id] = el
                }}
              />
            ))}

            {showReviewGate ? (
              <div className="mt-4">
                <ContractReviewChecklist
                  sections={editableBodySections}
                  checklist={reviewChecklist}
                  onChange={(itemId, status) =>
                    setReviewChecklist((cur) => ({ ...cur, [itemId]: status }))
                  }
                  onJumpToSection={jumpToSection}
                />
              </div>
            ) : null}
          </div>

          <ContractReviewRail
            className="mt-4 hidden md:sticky md:top-4 md:mt-0 md:block md:self-start"
            flaggedSections={flaggedSections}
            reviewCount={flaggedSections.length}
            saving={saving}
            previewing={previewing}
            finalizing={finalizing}
            canFinalize={canFinalize}
            showReviewGateHint={showReviewGate && !checklistComplete}
            onSave={() => void handleSave()}
            onPreview={() => void handlePreview()}
            onRequestFinalize={handleRequestFinalize}
            onDelete={onDeleted}
            onJumpToSection={jumpToSection}
            variant="sidebar"
          />
        </div>
      ) : null}

      {isDraft ? (
        <div className="fixed inset-x-0 bottom-[var(--mobile-nav-height,3.75rem)] z-40 md:hidden">
          <ContractReviewRail
            flaggedSections={flaggedSections}
            reviewCount={flaggedSections.length}
            saving={saving}
            previewing={previewing}
            finalizing={finalizing}
            canFinalize={canFinalize}
            showReviewGateHint={showReviewGate && !checklistComplete}
            onSave={() => void handleSave()}
            onPreview={() => void handlePreview()}
            onRequestFinalize={handleRequestFinalize}
            onDelete={onDeleted}
            onJumpToSection={jumpToSection}
            variant="mobileBar"
          />
        </div>
      ) : null}

      {!isDraft && pdfPath ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void handleOpenPdf()} disabled={openingPdf}>
            {openingPdf ? 'Ouverture…' : 'Voir le PDF du projet'}
          </Button>
          {!needsSignaturePlacement ? (
            <Button variant="secondary" onClick={() => setNeedsSignaturePlacement(true)}>
              Modifier la position de signature
            </Button>
          ) : null}
        </div>
      ) : null}

      {!isDraft && needsSignaturePlacement && pdfPath ? (
        <SignatureFocusOverlay onClose={() => setNeedsSignaturePlacement(false)}>
          <PdfSignaturePositionEditor
            pdfStoragePath={pdfPath}
            initial={{
              signature_page: document.signature_page ?? -1,
              signature_x: document.signature_x ?? 0.1,
              signature_y: document.signature_y ?? 0.78,
              signature_width: document.signature_width ?? 0.35,
              signature_height: document.signature_height ?? 0.09,
            }}
            onSave={handleSignatureSaved}
            saveLabel={signatureConfirmLabel}
            onCancel={() => setNeedsSignaturePlacement(false)}
          />
        </SignatureFocusOverlay>
      ) : null}

      {!isDraft && !needsSignaturePlacement ? (
        <p className="mt-4 text-xs font-body text-[var(--ink-muted)]">
          Ce contrat PDF est enregistré dans le projet. Le client pourra le signer depuis son portail
          d&apos;onboarding.
        </p>
      ) : null}

      <p className="mt-3 text-[10px] font-body text-[var(--ink-muted)]">
        Contenu assisté par IA — vous restez responsable du document envoyé au client.
      </p>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {feedback}
        {errorMsg}
      </div>
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
