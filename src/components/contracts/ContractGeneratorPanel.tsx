import { useEffect, useState } from 'react'
import { Button, Card } from '../ui'
import { GeneratedDocumentEditor } from './GeneratedDocumentEditor'
import { ContractGenerationSkeleton } from './ContractGenerationSkeleton'
import { ContractDocumentList } from './ContractDocumentList'
import { ContractProjectIntakeSummary } from './ContractProjectIntakeSummary'
import {
  deleteGeneratedDocument,
  fetchProjectGeneratedDocuments,
  generateContractDraft,
  type GeneratedDocumentRecord,
} from '../../lib/generatedDocuments'
import {
  fetchContractProjectContext,
  type ContractProjectContext,
} from '../../lib/contractProjectContext'

type ContractGeneratorPanelProps = {
  projectId: string
  aiContractsEnabled: boolean
  checklistContext?: string[]
}

type GenerationPhase = 'idle' | 'thinking' | 'error'

export function ContractGeneratorPanel({
  projectId,
  aiContractsEnabled,
  checklistContext = [],
}: ContractGeneratorPanelProps) {
  const [documents, setDocuments] = useState<GeneratedDocumentRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [brief, setBrief] = useState('')
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [projectContext, setProjectContext] = useState<ContractProjectContext | null>(null)
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [showAiDisclaimer, setShowAiDisclaimer] = useState(false)

  const load = async () => {
    try {
      const docs = await fetchProjectGeneratedDocuments(projectId)
      setDocuments(docs)
      setActiveDocumentId((cur) => {
        if (cur && docs.some((d) => d.id === cur)) return cur
        return docs[0]?.id ?? null
      })
    } catch {
      // table absente ou erreur réseau : section vide
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
    void fetchContractProjectContext(projectId).then(setProjectContext)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (!aiContractsEnabled && documents.length === 0) return null
  if (!loaded) return null

  const handleGenerate = async () => {
    if (!brief.trim()) return
    setGenerationPhase('thinking')
    setErrorMsg(null)
    try {
      const { documentId } = await generateContractDraft(projectId, brief.trim(), checklistContext)
      setBrief('')
      await load()
      setActiveDocumentId(documentId)
      setGenerationPhase('idle')
    } catch (reason) {
      setGenerationPhase('error')
      setErrorMsg(reason instanceof Error ? reason.message : 'Génération impossible.')
    }
  }

  const handleDelete = async (documentId: string) => {
    if (!window.confirm('Supprimer ce brouillon de contrat ?')) return
    try {
      await deleteGeneratedDocument(documentId)
      await load()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Suppression impossible.')
    }
  }

  const activeDocument = documents.find((d) => d.id === activeDocumentId) ?? null
  const activeIsDraft = activeDocument?.status === 'draft'

  const intakeForm = (
    <div>
      {projectContext ? <ContractProjectIntakeSummary context={projectContext} /> : null}

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        placeholder="Ex. : Prestation de conseil marketing digital, 3 mois, 2000 €/mois, paiement à 30 jours, clause de confidentialité standard."
        className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
        aria-label="Brief de la prestation"
      />
      <Button
        className="mt-2"
        onClick={() => void handleGenerate()}
        disabled={generationPhase === 'thinking' || !brief.trim()}
      >
        {generationPhase === 'thinking' ? 'Génération…' : 'Générer le brouillon'}
      </Button>
      <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
        Première version éditable — jamais envoyée automatiquement au client.
      </p>
      <button
        type="button"
        onClick={() => setShowAiDisclaimer((v) => !v)}
        className="mt-1 text-xs font-body text-[var(--accent)] underline-offset-2 hover:underline"
      >
        {showAiDisclaimer ? 'Masquer' : 'En savoir plus sur l’assistance IA'}
      </button>
      {showAiDisclaimer ? (
        <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
          Contenu assisté par IA — vous restez responsable du document envoyé au client.
        </p>
      ) : null}

      {generationPhase === 'thinking' ? <ContractGenerationSkeleton /> : null}
      {generationPhase === 'error' && errorMsg ? (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--amber)]/40 bg-[var(--amber-soft)]/30 p-3">
          <p className="text-sm font-body text-[var(--amber)]">{errorMsg}</p>
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => {
              setGenerationPhase('idle')
              setErrorMsg(null)
            }}
          >
            Réessayer
          </Button>
        </div>
      ) : null}
    </div>
  )

  const documentsBlock =
    documents.length > 0 ? (
      <div className={activeIsDraft ? 'mt-0' : 'mt-5'}>
        <ContractDocumentList
          documents={documents}
          activeId={activeDocumentId}
          onSelect={setActiveDocumentId}
        />
        {activeDocument ? (
          <div className="w-full min-w-0">
            <GeneratedDocumentEditor
              key={activeDocument.id}
              document={activeDocument}
              projectContext={projectContext}
              onFinalized={() => load()}
              onPdfCreated={() => load()}
              onDeleted={() => handleDelete(activeDocument.id)}
              signatureConfirmLabel="Sauvegarder la position de signature"
            />
          </div>
        ) : null}
      </div>
    ) : null

  return (
    <Card
      className={`w-full min-w-0 ${
        activeIsDraft ? 'pb-[calc(7.5rem+var(--mobile-nav-height,3.75rem))] md:pb-0' : ''
      }`}
    >
      <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Générer un contrat</h2>
      <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
        Décrivez la prestation : l&apos;IA rédige un brouillon à partir de votre projet, vos modèles
        et votre bibliothèque de clauses.
      </p>

      {!aiContractsEnabled ? (
        <p className="mt-3 text-xs font-body text-[var(--ink-muted)]">
          Module désactivé — activez « Génération de contrats » dans Paramètres → Intelligence
          artificielle.
        </p>
      ) : null}

      {aiContractsEnabled && activeIsDraft ? (
        <>
          <div className="mt-4">{documentsBlock}</div>
          <details className="mt-5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <summary className="cursor-pointer text-sm font-body font-medium text-[var(--ink)]">
              Créer un autre brouillon
            </summary>
            <div className="mt-3">{intakeForm}</div>
          </details>
        </>
      ) : null}

      {aiContractsEnabled && !activeIsDraft ? (
        <>
          <div className="mt-4">{intakeForm}</div>
          {documentsBlock}
        </>
      ) : null}

      {errorMsg && generationPhase !== 'error' ? (
        <p className="mt-2 text-sm font-body text-[var(--amber)]">{errorMsg}</p>
      ) : null}
    </Card>
  )
}
