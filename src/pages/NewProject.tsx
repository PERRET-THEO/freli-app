import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getOrCreateAgency } from '../lib/agency'
import { fetchAgencyAiFlags } from '../lib/agencyQueries'
import { sendProjectInviteEmail } from '../lib/resend'
import { supabase } from '../lib/supabase'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button, Card, Input } from '../components/ui'
import { ChecklistBuilder } from '../components/checklist/ChecklistBuilder'
import { CompanySearchAutocomplete } from '../components/company/CompanySearchAutocomplete'
import { GeneratedDocumentEditor } from '../components/contracts/GeneratedDocumentEditor'
import type { CompanyLookupResult, LegalDataSource } from '../lib/companyLookup'
import {
  buildChecklistItemConfig,
  buildChecklistItemValue,
  buildContractGenerationContext,
  buildDefaultContractBrief,
  CHECKLIST_TYPE_LABELS,
  getAiSignatureItem,
  getChecklistContextLines,
  hasAiGenerateItems,
  isGenerationContextStale,
  updateAiSignatureBrief,
  validateChecklist,
  type ContractGenerationContext,
  type DraftChecklistItem,
} from '../lib/checklist'
import { syncChecklistToProject, syncProjectPrice } from '../lib/checklistSync'
import {
  fetchProjectGeneratedDocuments,
  generateContractDraft,
  regenerateContractDraft,
  type GeneratedDocumentRecord,
} from '../lib/generatedDocuments'
import {
  listAgencyChecklistTemplates,
  type AgencyChecklistTemplate,
} from '../lib/checklistTemplates'

const INDUSTRIES = [
  'Web & Digital', 'E-commerce', 'Immobilier', 'Industrie', 'Santé',
  'Education', 'Restauration', 'Mode & Luxe', 'Autre',
]

const COMPANY_TYPES = [
  'Auto-entrepreneur', 'EURL', 'SARL', 'SAS', 'SASU', 'SA', 'Association', 'Autre',
]

const COMPANY_SIZES = ['1 personne', '2-5', '6-20', '21-50', '50+']

type PendingContractLink = {
  checklistItemId: string
  documentId: string
}

export function NewProject() {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [isCompany, setIsCompany] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [companyType, setCompanyType] = useState('')
  const [siret, setSiret] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [siren, setSiren] = useState('')
  const [codeNaf, setCodeNaf] = useState('')
  const [legalSource, setLegalSource] = useState<LegalDataSource | null>(null)

  const [showExtra, setShowExtra] = useState(false)
  const [addressStreet, setAddressStreet] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('France')

  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [notes, setNotes] = useState('')

  const [items, setItems] = useState<DraftChecklistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [contractTemplates, setContractTemplates] = useState<{ id: string; name: string }[]>([])
  const [hasDefaultContract, setHasDefaultContract] = useState(false)
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [agencyTemplates, setAgencyTemplates] = useState<AgencyChecklistTemplate[]>([])
  const [projectPrice, setProjectPrice] = useState('')
  const [prefillClientId, setPrefillClientId] = useState<string | null>(null)
  const [aiContractsEnabled, setAiContractsEnabled] = useState(false)

  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [pendingContractLinks, setPendingContractLinks] = useState<PendingContractLink[]>([])
  const [generatedDocuments, setGeneratedDocuments] = useState<GeneratedDocumentRecord[]>([])
  const [contractFinalized, setContractFinalized] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const [lastGenerationContext, setLastGenerationContext] = useState<ContractGenerationContext | null>(
    null,
  )
  const [showContextRecap, setShowContextRecap] = useState(true)
  const [regenerating, setRegenerating] = useState(false)

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clientIdParam = searchParams.get('clientId')

  const clientFullName = useMemo(
    () => `${firstName.trim()} ${lastName.trim()}`.trim(),
    [firstName, lastName],
  )

  const priceEur = useMemo(() => {
    const euros = Math.round(parseFloat(projectPrice.replace(',', '.')))
    return Number.isFinite(euros) && euros > 0 ? euros : null
  }, [projectPrice])

  const defaultContractBrief = useMemo(
    () => buildDefaultContractBrief(clientFullName, priceEur),
    [clientFullName, priceEur],
  )

  const needsContractStep = useMemo(() => hasAiGenerateItems(items), [items])

  const aiSignatureItem = useMemo(() => getAiSignatureItem(items), [items])

  const manualBrief = aiSignatureItem?.contractBrief ?? ''

  const currentGenerationContext = useMemo(
    () => buildContractGenerationContext(items, clientFullName, priceEur, manualBrief),
    [items, clientFullName, priceEur, manualBrief],
  )

  const contextStale = useMemo(
    () => isGenerationContextStale(currentGenerationContext, lastGenerationContext),
    [currentGenerationContext, lastGenerationContext],
  )

  const totalSteps = needsContractStep ? 3 : 2

  const onboardingLink = useMemo(
    () => (generatedToken ? `${window.location.origin}/p/${generatedToken}` : ''),
    [generatedToken],
  )

  const refreshAgencyTemplates = async (id: string) => {
    setAgencyTemplates(await listAgencyChecklistTemplates(id))
  }

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return
      const agency = await getOrCreateAgency(userData.user.id)
      if (!agency?.id) return
      setAgencyId(agency.id)

      const aiFlags = await fetchAgencyAiFlags(agency.id)
      setAiContractsEnabled(aiFlags.ai_contracts_enabled === true)

      const { data } = await supabase
        .from('contract_templates')
        .select('id, name, is_default')
        .eq('agency_id', agency.id)
        .order('created_at', { ascending: false })
      const templates = (data ?? []) as { id: string; name: string; is_default?: boolean }[]
      setContractTemplates(templates.map(({ id, name }) => ({ id, name })))
      setHasDefaultContract(templates.some((t) => t.is_default === true))
      await refreshAgencyTemplates(agency.id)
    }
    load()
  }, [])

  useEffect(() => {
    if (!clientIdParam) return
    const loadClient = async () => {
      const { data: c } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientIdParam)
        .maybeSingle()
      if (!c) return

      setFirstName(c.first_name ?? '')
      setLastName(c.last_name ?? '')
      setClientEmail(c.email ?? '')
      setPhone(c.phone ?? '')

      const hasCompany = Boolean(c.company_name || c.company_type || c.siret || c.vat_number)
      setIsCompany(hasCompany)
      setCompanyName(c.company_name ?? '')
      setCompanyType(c.company_type ?? '')
      setSiret(c.siret ?? '')
      setVatNumber(c.vat_number ?? '')
      setSiren(c.siren ?? '')
      setCodeNaf(c.code_naf ?? '')
      setLegalSource((c.source_donnees_legales as LegalDataSource | null) ?? null)

      const hasExtra = Boolean(
        c.address_street ||
          c.address_postal_code ||
          c.address_city ||
          c.website ||
          c.industry ||
          c.company_size ||
          c.notes,
      )
      setShowExtra(hasExtra)
      setAddressStreet(c.address_street ?? '')
      setPostalCode(c.address_postal_code ?? '')
      setCity(c.address_city ?? '')
      setCountry(c.address_country ?? 'France')
      setWebsite(c.website ?? '')
      setIndustry(c.industry ?? '')
      setCompanySize(c.company_size ?? '')
      setNotes(c.notes ?? '')

      setPrefillClientId(clientIdParam)
    }
    loadClient()
  }, [clientIdParam])

  const handleCompanySelect = (company: CompanyLookupResult) => {
    setCompanyName(company.raison_sociale)
    setCompanyType(company.forme_juridique)
    setSiret(company.siret)
    setSiren(company.siren)
    setCodeNaf(company.code_naf)
    if (company.vat_number) setVatNumber(company.vat_number)
    if (company.adresse || company.code_postal || company.ville) {
      setShowExtra(true)
      setAddressStreet(company.adresse)
      setPostalCode(company.code_postal)
      setCity(company.ville)
      setCountry('France')
    }
    setLegalSource('api_gouv')
  }

  const markLegalManualEdit = () => {
    setLegalSource((source) => (source === 'api_gouv' ? 'saisie_manuelle' : source))
  }

  const handleStepOneSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (!firstName.trim() || !lastName.trim() || !clientEmail.trim()) {
      setError('Le prénom, le nom et l\u2019email du client sont obligatoires.')
      return
    }
    setStep(2)
  }

  const linkContractToChecklistItem = async (
    checklistItemId: string,
    contractTemplateId: string,
  ) => {
    const { error: updateError } = await supabase
      .from('checklist_items')
      .update({
        contract_template_id: contractTemplateId,
        value: JSON.stringify({ template_id: contractTemplateId, status: 'pending' }),
      })
      .eq('id', checklistItemId)
    if (updateError) throw new Error(updateError.message)
  }

  const sendInviteAndFinish = async (projectId: string, token: string) => {
    await sendProjectInviteEmail({ projectId })
    setGeneratedToken(token)
    setStep(2)
  }

  const createProjectAndChecklist = async (): Promise<{
    projectId: string
    token: string
    aiLinks: PendingContractLink[]
  }> => {
    const token = crypto.randomUUID()
    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      throw new Error('Utilisateur non connecté. Merci de vous reconnecter.')
    }

    const agency = await getOrCreateAgency(userData.user.id)
    if (!agency?.id) {
      throw new Error('Impossible de créer automatiquement votre agence.')
    }
    const resolvedAgencyId = agency.id

    const fullName = clientFullName
    const email = clientEmail.trim()

    let clientId: string | null = null

    if (prefillClientId) {
      clientId = prefillClientId
      const clientUpdate: Record<string, unknown> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email,
        phone: phone.trim() || null,
        company_name: isCompany ? companyName.trim() || null : null,
        company_type: isCompany ? companyType || null : null,
        siret: isCompany ? siret.trim() || null : null,
        vat_number: isCompany ? vatNumber.trim() || null : null,
        siren: isCompany ? siren.trim() || null : null,
        code_naf: isCompany ? codeNaf.trim() || null : null,
        source_donnees_legales: isCompany ? legalSource : null,
        address_street: showExtra ? addressStreet.trim() || null : null,
        address_postal_code: showExtra ? postalCode.trim() || null : null,
        address_city: showExtra ? city.trim() || null : null,
        address_country: showExtra ? country.trim() || 'France' : null,
        website: showExtra ? website.trim() || null : null,
        industry: showExtra ? industry || null : null,
        company_size: showExtra ? companySize || null : null,
        notes: showExtra ? notes.trim() || null : null,
        updated_at: new Date().toISOString(),
      }
      const { error: clientUpdateError } = await supabase
        .from('clients')
        .update(clientUpdate)
        .eq('id', prefillClientId)
      if (clientUpdateError) {
        console.warn('Client update failed:', clientUpdateError.message)
      }
    } else {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('agency_id', resolvedAgencyId)
        .eq('email', email)
        .maybeSingle()

      if (existingClient?.id) {
        clientId = existingClient.id
      } else {
        const clientPayload: Record<string, unknown> = {
          agency_id: resolvedAgencyId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email,
          phone: phone.trim() || null,
        }
        if (isCompany) {
          clientPayload.company_name = companyName.trim() || null
          clientPayload.company_type = companyType || null
          clientPayload.siret = siret.trim() || null
          clientPayload.vat_number = vatNumber.trim() || null
          clientPayload.siren = siren.trim() || null
          clientPayload.code_naf = codeNaf.trim() || null
          clientPayload.source_donnees_legales = legalSource
        }
        if (showExtra) {
          clientPayload.address_street = addressStreet.trim() || null
          clientPayload.address_postal_code = postalCode.trim() || null
          clientPayload.address_city = city.trim() || null
          clientPayload.address_country = country.trim() || 'France'
          clientPayload.website = website.trim() || null
          clientPayload.industry = industry || null
          clientPayload.company_size = companySize || null
          clientPayload.notes = notes.trim() || null
        }

        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert(clientPayload)
          .select('id')
          .single()

        if (clientError) {
          console.warn('Client insert failed (table may not exist yet):', clientError.message)
        } else {
          clientId = newClient.id
        }
      }
    }

    const projectInsert: Record<string, unknown> = {
      agency_id: resolvedAgencyId,
      client_name: fullName,
      client_email: email,
      token,
    }
    if (clientId) projectInsert.client_id = clientId
    if (priceEur) projectInsert.price = priceEur

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert(projectInsert)
      .select('id, token')
      .single()

    if (projectError || !project) {
      throw new Error(projectError?.message ?? 'Impossible de créer le projet.')
    }

    // Même sérialisation que syncChecklistToProject : value + config (choix, RDV, conditions).
    const checklistPayload = items.map((item, index) => ({
      project_id: project.id,
      label: item.label.trim(),
      type: item.type,
      required: true,
      order_index: index,
      completed: false,
      contract_template_id:
        item.type === 'signature' && item.contractSource === 'existing'
          ? item.contractTemplateId ?? null
          : null,
      value: buildChecklistItemValue(item),
      config: buildChecklistItemConfig(item, items),
    }))

    const { data: insertedItems, error: checklistError } = await supabase
      .from('checklist_items')
      .insert(checklistPayload)
      .select('id, order_index')

    if (checklistError || !insertedItems) {
      throw new Error(checklistError?.message ?? 'Impossible de créer la checklist.')
    }

    const aiLinks: PendingContractLink[] = []
    for (const [index, item] of items.entries()) {
      if (item.type !== 'signature' || item.contractSource !== 'ai_generate') continue
      const dbItem = insertedItems.find((row) => row.order_index === index)
      if (!dbItem) continue
      aiLinks.push({ checklistItemId: dbItem.id, documentId: '' })
    }

    return { projectId: project.id, token: project.token, aiLinks }
  }

  const runContractGeneration = async (projectId: string, isRegen: boolean) => {
    const aiItem = getAiSignatureItem(items)
    if (!aiItem?.contractBrief?.trim()) {
      throw new Error('Brief du contrat manquant.')
    }

    const ctx = buildContractGenerationContext(
      items,
      clientFullName,
      priceEur,
      aiItem.contractBrief.trim(),
    )
    const checklistContext = getChecklistContextLines(items)
    const draftIds = isRegen
      ? generatedDocuments.filter((doc) => doc.status === 'draft').map((doc) => doc.id)
      : []

    const { documentId } =
      draftIds.length > 0
        ? await regenerateContractDraft(projectId, ctx.brief, draftIds, checklistContext)
        : await generateContractDraft(projectId, ctx.brief, checklistContext)

    setLastGenerationContext(ctx)

    if (pendingContractLinks.length > 0) {
      setPendingContractLinks(
        pendingContractLinks.map((link) => ({ ...link, documentId })),
      )
    }

    const docs = await fetchProjectGeneratedDocuments(projectId)
    setGeneratedDocuments(docs)
  }

  const syncProjectBeforeContractStep = async (projectId: string) => {
    await syncProjectPrice(projectId, priceEur)
    const signatureItemId = pendingContractLinks[0]?.checklistItemId ?? null
    const syncResult = await syncChecklistToProject(projectId, items, signatureItemId)
    if (syncResult.signatureItemId) {
      setPendingContractLinks([
        {
          checklistItemId: syncResult.signatureItemId,
          documentId: pendingContractLinks[0]?.documentId ?? '',
        },
      ])
    }
  }

  const continueToContractStep = async () => {
    if (!createdProjectId) return
    setLoading(true)
    setLoadingMessage('Mise à jour de la checklist…')
    setError(null)
    try {
      await syncProjectBeforeContractStep(createdProjectId)
      const docs = await fetchProjectGeneratedDocuments(createdProjectId)
      setGeneratedDocuments(docs)
      setStep(3)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Synchronisation impossible.')
    } finally {
      setLoading(false)
      setLoadingMessage(null)
    }
  }

  const handleRegenerateContract = async () => {
    if (!createdProjectId || generatedToken || contractFinalized) return
    setRegenerating(true)
    setLoadingMessage('Régénération du contrat… (jusqu\u2019à 1 min)')
    setError(null)
    try {
      await syncProjectBeforeContractStep(createdProjectId)
      await runContractGeneration(createdProjectId, true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Régénération impossible.')
    } finally {
      setRegenerating(false)
      setLoadingMessage(null)
    }
  }

  const handleBriefChange = (value: string) => {
    setItems(updateAiSignatureBrief(items, value))
  }

  const handleCreateProject = async () => {
    const validationError = validateChecklist(items, {
      hasDefaultContract,
      aiContractsEnabled,
      priceEur,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    if (createdProjectId && needsContractStep) {
      await continueToContractStep()
      return
    }

    setError(null)
    setLoading(true)
    setLoadingMessage('Création du projet…')

    try {
      const { projectId, token, aiLinks } = await createProjectAndChecklist()
      setCreatedProjectId(projectId)

      if (aiLinks.length === 0) {
        await sendInviteAndFinish(projectId, token)
        return
      }

      setPendingContractLinks(aiLinks)
      setLoadingMessage('Génération du contrat par l\u2019IA… (jusqu\u2019à 1 min)')
      await runContractGeneration(projectId, false)
      setContractFinalized(false)
      setStep(3)
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : 'Une erreur est survenue pendant la création.'
      setError(message)
    } finally {
      setLoading(false)
      setLoadingMessage(null)
    }
  }

  const handleContractFinalized = async (contractTemplateId: string) => {
    if (!createdProjectId || pendingContractLinks.length === 0) return

    setLoading(true)
    setError(null)
    try {
      for (const link of pendingContractLinks) {
        await linkContractToChecklistItem(link.checklistItemId, contractTemplateId)
      }
      setContractFinalized(true)

      const { data: project } = await supabase
        .from('projects')
        .select('token')
        .eq('id', createdProjectId)
        .single()

      if (!project?.token) throw new Error('Projet introuvable.')

      await sendInviteAndFinish(createdProjectId, project.token)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erreur lors de la finalisation.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!onboardingLink) return
    await navigator.clipboard.writeText(onboardingLink)
    setCopySuccess(true)
    window.setTimeout(() => setCopySuccess(false), 1800)
  }

  const selectCls =
    'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

  const stepSubtitle =
    step === 1
      ? `Étape 1/${totalSteps} — Client`
      : step === 2
        ? `Étape 2/${totalSteps} — Checklist`
        : `Étape 3/${totalSteps} — Finaliser le contrat`

  const stepTwoButtonLabel = createdProjectId && needsContractStep
    ? 'Continuer vers le contrat →'
    : needsContractStep
      ? 'Continuer →'
      : "Générer le lien d'onboarding"

  const renderStepIndicator = (n: 1 | 2 | 3, label: string) => {
    const isActive = step === n
    const isDone = step > n
    return (
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-display font-bold ${
            isActive
              ? 'bg-[var(--accent)] text-[var(--white)]'
              : isDone
                ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                : 'bg-[var(--surface-warm)] text-[var(--ink-muted)]'
          }`}
        >
          {n}
        </div>
        <span className="text-sm font-body text-[var(--ink-soft)]">{label}</span>
      </div>
    )
  }

  return (
    <DashboardLayout title="Nouveau projet" subtitle={stepSubtitle} maxWidth="4xl">
      <Card>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {renderStepIndicator(1, 'Client')}
          <span className="text-sm text-[var(--ink-muted)]">→</span>
          {renderStepIndicator(2, 'Checklist')}
          {needsContractStep ? (
            <>
              <span className="text-sm text-[var(--ink-muted)]">→</span>
              {renderStepIndicator(3, 'Contrat')}
            </>
          ) : null}
        </div>

        {step === 1 ? (
          <form className="mt-6 space-y-5" onSubmit={handleStepOneSubmit}>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
              <h3 className="font-display text-base font-semibold text-[var(--ink)]">Informations personnelles</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input placeholder="Prénom *" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                <Input placeholder="Nom *" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input type="email" placeholder="Email professionnel *" required value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                <Input type="tel" placeholder="+33 6 00 00 00 00" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={isCompany} onChange={(e) => setIsCompany(e.target.checked)} className="h-4 w-4 rounded accent-[var(--accent)]" />
                <span className="font-display text-base font-semibold text-[var(--ink)]">Mon client est une entreprise</span>
              </label>
              {isCompany && (
                <div className="mt-4 space-y-3">
                  <CompanySearchAutocomplete
                    label="Rechercher l'entreprise du client"
                    placeholder="Nom de l'entreprise ou SIRET/SIREN du client"
                    onSelect={handleCompanySelect}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Nom de l'entreprise" value={companyName} onChange={(e) => { setCompanyName(e.target.value); markLegalManualEdit() }} />
                    <select className={selectCls} value={companyType} onChange={(e) => { setCompanyType(e.target.value); markLegalManualEdit() }}>
                      <option value="">Type d&apos;entreprise</option>
                      {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="SIRET (14 chiffres)" value={siret} onChange={(e) => { setSiret(e.target.value); markLegalManualEdit() }} maxLength={14} />
                    <Input placeholder="N° TVA (FR + 11 chiffres)" value={vatNumber} onChange={(e) => { setVatNumber(e.target.value); markLegalManualEdit() }} />
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowExtra(!showExtra)}
              className="text-sm font-body font-medium text-[var(--accent)] hover:underline"
            >
              {showExtra ? '− Masquer les infos complémentaires' : '+ Ajouter plus d\u2019infos'}
            </button>

            {showExtra && (
              <>
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
                  <h3 className="font-display text-base font-semibold text-[var(--ink)]">Adresse</h3>
                  <div className="mt-3 space-y-3">
                    <Input placeholder="Rue" value={addressStreet} onChange={(e) => { setAddressStreet(e.target.value); markLegalManualEdit() }} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input placeholder="Code postal" value={postalCode} onChange={(e) => { setPostalCode(e.target.value); markLegalManualEdit() }} maxLength={5} />
                      <Input placeholder="Ville" value={city} onChange={(e) => { setCity(e.target.value); markLegalManualEdit() }} />
                      <Input placeholder="Pays" value={country} onChange={(e) => setCountry(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
                  <h3 className="font-display text-base font-semibold text-[var(--ink)]">Informations complémentaires</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input placeholder="https://..." value={website} onChange={(e) => setWebsite(e.target.value)} />
                    <select className={selectCls} value={industry} onChange={(e) => setIndustry(e.target.value)}>
                      <option value="">Secteur d&apos;activité</option>
                      {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div className="mt-3">
                    <p className="mb-2 text-sm font-body text-[var(--ink-soft)]">Taille de l&apos;entreprise</p>
                    <div className="flex flex-wrap gap-2">
                      {COMPANY_SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setCompanySize(s)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-body transition ${companySize === s ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--ink-muted)]'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    placeholder="Informations importantes sur ce client..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
                    rows={3}
                  />
                </div>
              </>
            )}

            {error ? <p className="text-sm font-body text-[var(--amber)]">{error}</p> : null}
            <Button type="submit" className="w-full">Suivant →</Button>
          </form>
        ) : step === 2 ? (
          <div className="mt-6">
            <p className="text-sm font-body text-[var(--ink-muted)]">Configure la checklist de démarrage.</p>
            {createdProjectId && needsContractStep ? (
              <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
                Tant que l&apos;invitation n&apos;est pas envoyée, vous pouvez modifier la checklist
                puis régénérer le contrat à l&apos;étape suivante.
              </p>
            ) : null}

            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
              <label className="mb-1 block font-display text-base font-semibold text-[var(--ink)]">
                Prix (€)
              </label>
              <p className="mb-2 text-xs font-body text-[var(--ink-muted)]">
                Montant facturé au client à la fin de l&apos;onboarding si Stripe est activé dans Intégrations. Laisser vide pour ne pas proposer de paiement.
              </p>
              <Input
                type="number"
                min={0}
                step={1}
                placeholder="ex: 650"
                value={projectPrice}
                onChange={(e) => setProjectPrice(e.target.value)}
              />
            </div>

            <div className="mt-4">
              <ChecklistBuilder
                items={items}
                onChange={setItems}
                contractTemplates={contractTemplates}
                agencyTemplates={agencyTemplates}
                agencyId={agencyId}
                aiContractsEnabled={aiContractsEnabled}
                hasDefaultContract={hasDefaultContract}
                defaultContractBrief={defaultContractBrief}
                priceEur={priceEur}
                onTemplatesChanged={() => {
                  if (agencyId) refreshAgencyTemplates(agencyId)
                }}
              />
            </div>

            {error ? <p className="mt-3 text-sm font-body text-[var(--amber)]">{error}</p> : null}
            {loadingMessage ? (
              <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">{loadingMessage}</p>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => setStep(1)} disabled={loading}>
                ← Retour
              </Button>
              <Button className="w-full py-4 text-base" onClick={handleCreateProject} disabled={loading}>
                {loading ? 'En cours…' : stepTwoButtonLabel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-sm font-body text-[var(--ink-muted)]">
              Tant que l&apos;invitation n&apos;est pas envoyée, vous pouvez ajuster la checklist
              et régénérer le contrat. Relisez-le puis finalisez-le avant l&apos;envoi à{' '}
              {clientFullName || 'votre client'}.
            </p>

            {contextStale && !generatedToken && !contractFinalized ? (
              <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--amber)]/40 bg-[var(--amber-soft)] px-4 py-3">
                <p className="text-sm font-body text-[var(--amber)]">
                  La checklist ou le brief a changé depuis la dernière génération. Régénérez le
                  contrat pour intégrer ces éléments.
                </p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={() => void handleRegenerateContract()}
                  disabled={regenerating || loading || contractFinalized}
                >
                  {regenerating ? 'Régénération…' : 'Régénérer le contrat'}
                </Button>
              </div>
            ) : null}

            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)]">
              <button
                type="button"
                onClick={() => setShowContextRecap((value) => !value)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="font-display text-sm font-semibold text-[var(--ink)]">
                  Contexte du contrat
                </span>
                <span className="text-xs font-body text-[var(--ink-muted)]">
                  {showContextRecap ? 'Masquer' : 'Afficher'}
                </span>
              </button>
              {showContextRecap ? (
                <div className="border-t border-[var(--border)] px-4 py-3">
                  <p className="text-sm font-body text-[var(--ink-soft)]">
                    Client : {clientFullName || '—'}
                    {priceEur ? ` · ${priceEur} € HT` : ''}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-sm font-body text-[var(--ink-soft)]"
                      >
                        <span>{item.label}</span>
                        <span className="shrink-0 rounded-full bg-[var(--surface-warm)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                          {CHECKLIST_TYPE_LABELS[item.type]}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={loading || contractFinalized || regenerating}
                    className="mt-3 text-sm font-body font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
                  >
                    Modifier la checklist →
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4">
              <label className="mb-1 block font-display text-sm font-semibold text-[var(--ink)]">
                Brief de l&apos;agence
              </label>
              <p className="mb-2 text-xs font-body text-[var(--ink-muted)]">
                Ce brief et les éléments de la checklist alimentent la génération.
              </p>
              <textarea
                value={manualBrief}
                onChange={(e) => handleBriefChange(e.target.value)}
                rows={4}
                disabled={contractFinalized || regenerating}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
              />
            </div>

            {generatedDocuments.length > 0 ? (
              <div className="mt-4 space-y-4">
                {generatedDocuments.map((doc) => (
                  <GeneratedDocumentEditor
                    key={doc.id}
                    document={doc}
                    onFinalized={handleContractFinalized}
                    onRegenerate={
                      !generatedToken && !contractFinalized ? handleRegenerateContract : undefined
                    }
                    regenerating={regenerating}
                    regenerateDisabled={loading || contractFinalized || Boolean(generatedToken)}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm font-body text-[var(--ink-muted)]">
                Chargement du brouillon…
              </p>
            )}

            {contractFinalized ? (
              <p className="mt-3 text-sm font-body text-[var(--mint)]">
                Contrat finalisé — invitation envoyée au client.
              </p>
            ) : null}

            {error ? <p className="mt-3 text-sm font-body text-[var(--amber)]">{error}</p> : null}
            {loadingMessage ? (
              <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">{loadingMessage}</p>
            ) : null}

            <div className="mt-6">
              <Button
                variant="secondary"
                onClick={() => setStep(2)}
                disabled={loading || contractFinalized || regenerating}
              >
                ← Retour à la checklist
              </Button>
            </div>
          </div>
        )}
      </Card>

      {generatedToken ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/45 px-4">
          <Card className="w-full max-w-xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">🎉 Lien généré !</h2>
            <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
              L&apos;invitation a été envoyée à {clientEmail.trim()}.
            </p>
            <p className="mt-4 break-all rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3 text-sm font-body text-[var(--ink)]">{onboardingLink}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button onClick={handleCopy}>{copySuccess ? 'Copie effectuée' : 'Copier le lien'}</Button>
              {prefillClientId ? (
                <Link to={`/dashboard/client/${prefillClientId}`} className="w-full sm:w-auto"><Button variant="secondary" className="w-full">Retour à la fiche client</Button></Link>
              ) : (
                <Link to="/dashboard" className="w-full sm:w-auto"><Button variant="secondary" className="w-full">Retour au dashboard</Button></Link>
              )}
              <Button variant="secondary" onClick={() => navigate(`/p/${generatedToken}`)}>Ouvrir le portail</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </DashboardLayout>
  )
}
