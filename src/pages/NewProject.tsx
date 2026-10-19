import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAgencyAiFlags } from '../lib/agencyQueries'
import { useAgencySession } from '../contexts/AgencyContext'
import { sendProjectInviteEmail } from '../lib/resend'
import { supabase } from '../lib/supabase'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button, Card } from '../components/ui'
import {
  ClientInfoStep,
  type ConflictDecision,
} from '../components/new-project/ClientInfoStep'
import {
  canResendInvite,
  formatInviteSentAt,
  type ProjectInviteStatus,
} from '../lib/projectInvite'
import { ChecklistStep } from '../components/new-project/ChecklistStep'
import { ContractFinalizeStep } from '../components/new-project/ContractFinalizeStep'
import type { CompanyLookupResult, LegalDataSource } from '../lib/companyLookup'
import {
  buildContractGenerationContext,
  buildDefaultContractBrief,
  getAiSignatureItem,
  getChecklistContextLines,
  hasAiGenerateItems,
  isGenerationContextStale,
  updateAiSignatureBrief,
  validateChecklist,
  type ContractGenerationContext,
  type DraftChecklistItem,
} from '../lib/checklist'
import {
  syncChecklistToProject,
  syncProjectPaymentSettings,
  syncProjectPrice,
} from '../lib/checklistSync'
import { parsePriceInput, type PaymentUnlockMode } from '../lib/payments'
import { isValidContactEmail } from '../lib/contactLinks'
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
import { listClients, type ClientListRow } from '../lib/clientListQuery'
import { createProjectWithClient } from '../lib/createProjectWithClient'
import {
  ClientExistsError,
  normalizeClientEmail,
  suggestProjectName,
  summarizeClientMergeChanges,
  validateWizardClientFields,
  type ClientResolution,
  type ClientWizardFieldErrors,
  type ClientWizardForm,
  type ClientWizardMode,
  type ExistingClientSnapshot,
} from '../lib/clientWizard'

type PendingContractLink = {
  checklistItemId: string
  documentId: string
}

function snapshotFromRow(c: Record<string, unknown>): ExistingClientSnapshot {
  return {
    id: String(c.id),
    first_name: String(c.first_name ?? ''),
    last_name: String(c.last_name ?? ''),
    email: String(c.email ?? ''),
    phone: (c.phone as string | null) ?? null,
    company_name: (c.company_name as string | null) ?? null,
    company_type: (c.company_type as string | null) ?? null,
    siret: (c.siret as string | null) ?? null,
    siren: (c.siren as string | null) ?? null,
    code_naf: (c.code_naf as string | null) ?? null,
    vat_number: (c.vat_number as string | null) ?? null,
    source_donnees_legales: (c.source_donnees_legales as LegalDataSource | null) ?? null,
    address_street: (c.address_street as string | null) ?? null,
    address_city: (c.address_city as string | null) ?? null,
    address_postal_code: (c.address_postal_code as string | null) ?? null,
    address_country: (c.address_country as string | null) ?? null,
    website: (c.website as string | null) ?? null,
    industry: (c.industry as string | null) ?? null,
    company_size: (c.company_size as string | null) ?? null,
    notes: (c.notes as string | null) ?? null,
  }
}

export function NewProject() {
  const { agency, loading: agencySessionLoading } = useAgencySession()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [clientMode, setClientMode] = useState<ClientWizardMode>('new')
  const [clientResolution, setClientResolution] = useState<ClientResolution | null>(null)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [fieldsReadOnly, setFieldsReadOnly] = useState(false)
  const [emailConflict, setEmailConflict] = useState<ExistingClientSnapshot | null>(null)
  const [conflictDecision, setConflictDecision] = useState<ConflictDecision | null>(null)
  const [emailLookupLoading, setEmailLookupLoading] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<ProjectInviteStatus | null>(null)
  const [inviteSentAt, setInviteSentAt] = useState<string | null>(null)
  const [inviteLastAttemptAt, setInviteLastAttemptAt] = useState<string | null>(null)
  const [inviteResending, setInviteResending] = useState(false)

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

  const [projectName, setProjectName] = useState('')
  const [projectNameDirty, setProjectNameDirty] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<ClientWizardFieldErrors>({})

  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [clientSearchResults, setClientSearchResults] = useState<ClientListRow[]>([])
  const [clientSearchLoading, setClientSearchLoading] = useState(false)

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
  const [paymentUnlockMode, setPaymentUnlockMode] =
    useState<PaymentUnlockMode>('after_prerequisites')
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
  const emailLookupTimer = useRef<number | null>(null)
  const searchTimer = useRef<number | null>(null)

  const clientFullName = useMemo(
    () => `${firstName.trim()} ${lastName.trim()}`.trim(),
    [firstName, lastName],
  )

  const wizardForm = useMemo((): ClientWizardForm => ({
    firstName,
    lastName,
    email: clientEmail,
    phone,
    isCompany,
    companyName,
    companyType,
    siret,
    vatNumber,
    siren,
    codeNaf,
    legalSource,
    addressStreet,
    postalCode,
    city,
    country,
    website,
    industry,
    companySize,
    notes,
  }), [
    firstName, lastName, clientEmail, phone, isCompany, companyName, companyType,
    siret, vatNumber, siren, codeNaf, legalSource, addressStreet, postalCode,
    city, country, website, industry, companySize, notes,
  ])

  const mergeChanges = useMemo(
    () => (emailConflict ? summarizeClientMergeChanges(emailConflict, wizardForm) : []),
    [emailConflict, wizardForm],
  )

  const priceEur = useMemo(() => parsePriceInput(projectPrice), [projectPrice])

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

  const applyClientSnapshot = useCallback((c: ExistingClientSnapshot, opts?: { readOnly?: boolean }) => {
    setSelectedClientId(c.id)
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
    setLegalSource(c.source_donnees_legales)

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
    setFieldsReadOnly(opts?.readOnly ?? true)
  }, [])

  const loadClientById = useCallback(async (id: string, readOnly = true) => {
    const { data: c } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
    if (!c) return null
    const snapshot = snapshotFromRow(c as Record<string, unknown>)
    applyClientSnapshot(snapshot, { readOnly })
    return snapshot
  }, [applyClientSnapshot])

  useEffect(() => {
    if (!agency?.id) return
    setAgencyId(agency.id)
    const load = async () => {
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
    void load()
  }, [agency?.id])

  useEffect(() => {
    if (!clientIdParam) return
    setClientMode('existing')
    setClientResolution('attach')
    loadClientById(clientIdParam, true)
  }, [clientIdParam, loadClientById])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  // Smart project name while not dirty
  useEffect(() => {
    if (projectNameDirty) return
    setProjectName(
      suggestProjectName({
        companyName: isCompany ? companyName : '',
        firstName,
        lastName,
      }),
    )
  }, [projectNameDirty, isCompany, companyName, firstName, lastName])

  // Client search (existing mode)
  useEffect(() => {
    if (clientMode !== 'existing' || !agencyId) return
    const q = clientSearchQuery.trim()
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    if (q.length < 2) {
      setClientSearchResults([])
      setClientSearchLoading(false)
      return
    }
    setClientSearchLoading(true)
    searchTimer.current = window.setTimeout(async () => {
      try {
        const { rows } = await listClients({ agencyId, search: q, pageSize: 8 })
        setClientSearchResults(rows)
      } catch {
        setClientSearchResults([])
      } finally {
        setClientSearchLoading(false)
      }
    }, 300)
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current)
    }
  }, [clientSearchQuery, clientMode, agencyId])

  const lookupEmailConflict = useCallback(async () => {
    if (clientMode !== 'new' || !agencyId) return
    if (clientResolution === 'attach' || clientResolution === 'update') return
    const email = normalizeClientEmail(clientEmail)
    if (!email || !isValidContactEmail(email)) {
      setEmailConflict(null)
      return
    }
    setEmailLookupLoading(true)
    try {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('agency_id', agencyId)
        .ilike('email', email)
        .limit(1)
        .maybeSingle()
      if (data) {
        setEmailConflict(snapshotFromRow(data as Record<string, unknown>))
      } else {
        setEmailConflict(null)
      }
    } finally {
      setEmailLookupLoading(false)
    }
  }, [agencyId, clientEmail, clientMode, clientResolution])

  const handleClientEmailBlur = () => {
    if (emailLookupTimer.current) window.clearTimeout(emailLookupTimer.current)
    emailLookupTimer.current = window.setTimeout(() => {
      void lookupEmailConflict()
    }, 400)
  }

  const handleClientModeChange = (mode: ClientWizardMode) => {
    setClientMode(mode)
    setEmailConflict(null)
    setConflictDecision(null)
    setFieldErrors({})
    setError(null)
    if (mode === 'new') {
      setSelectedClientId(null)
      setClientResolution(null)
      setFieldsReadOnly(false)
      setClientSearchQuery('')
    } else {
      setClientResolution(null)
      setFieldsReadOnly(Boolean(selectedClientId))
    }
  }

  const handleSelectExistingClient = async (id: string) => {
    await loadClientById(id, true)
    setClientResolution('attach')
    setClientSearchQuery('')
    setError(null)
  }

  const handleEditExistingClient = () => {
    setFieldsReadOnly(false)
    setClientResolution('update')
  }

  const handleConflictAttach = () => {
    if (!emailConflict) return
    const changes = summarizeClientMergeChanges(emailConflict, wizardForm)
    applyClientSnapshot(emailConflict, { readOnly: true })
    setClientResolution('attach')
    setConflictDecision({ resolution: 'attach', client: emailConflict, changes })
    setEmailConflict(null)
    setClientMode('existing')
  }

  const handleConflictUpdate = () => {
    if (!emailConflict) return
    const changes = summarizeClientMergeChanges(emailConflict, wizardForm)
    setSelectedClientId(emailConflict.id)
    setClientResolution('update')
    setConflictDecision({ resolution: 'update', client: emailConflict, changes })
    setEmailConflict(null)
    setFieldsReadOnly(false)
  }

  const handleConflictCancel = () => {
    setEmailConflict(null)
    setConflictDecision(null)
    setClientEmail('')
    setClientResolution(null)
    setSelectedClientId(null)
  }

  const handleConflictChangeDecision = () => {
    if (!conflictDecision) return
    setEmailConflict(conflictDecision.client)
    setConflictDecision(null)
    setClientResolution(null)
    setClientMode('new')
    setFieldsReadOnly(false)
  }

  const handleClearSelectedClient = () => {
    setSelectedClientId(null)
    setClientResolution(null)
    setFieldsReadOnly(false)
    setConflictDecision(null)
    setFirstName('')
    setLastName('')
    setClientEmail('')
    setPhone('')
    setIsCompany(false)
    setCompanyName('')
    setCompanyType('')
    setSiret('')
    setVatNumber('')
    setSiren('')
    setCodeNaf('')
    setLegalSource(null)
    setShowExtra(false)
    setAddressStreet('')
    setPostalCode('')
    setCity('')
    setCountry('France')
    setWebsite('')
    setIndustry('')
    setCompanySize('')
    setNotes('')
    setClientSearchQuery('')
  }

  const selectedClientLabel = useMemo(() => {
    if (!selectedClientId) return null
    const name = `${firstName.trim()} ${lastName.trim()}`.trim()
    const company = companyName.trim()
    const email = clientEmail.trim()
    const head = company ? `${name} — ${company}` : name
    return email ? `${head} · ${email}` : head || null
  }, [selectedClientId, firstName, lastName, companyName, clientEmail])

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
    setIsCompany(true)
  }

  const markLegalManualEdit = () => {
    setLegalSource((source) => (source === 'api_gouv' ? 'saisie_manuelle' : source))
  }

  const handleTemplateApplied = (templateLabel: string | null) => {
    if (projectNameDirty) return
    setProjectName(
      suggestProjectName({
        companyName: isCompany ? companyName : '',
        firstName,
        lastName,
        templateLabel,
      }),
    )
  }

  const handleStepOneSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (clientMode === 'existing' && !selectedClientId) {
      setError('Sélectionne un client existant ou passe en « Nouveau client ».')
      return
    }

    if (emailConflict && clientMode === 'new') {
      setError('Choisis une action pour le client existant avant de continuer.')
      return
    }

    const errors = validateWizardClientFields(wizardForm, projectName)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    if (clientMode === 'existing') {
      setClientResolution(fieldsReadOnly ? 'attach' : 'update')
    } else if (!clientResolution) {
      setClientResolution('create')
    }

    setStep(2)
  }

  const linkGeneratedDocumentToChecklistItem = async (
    checklistItemId: string,
    generatedDocumentId: string,
  ) => {
    const { error: updateError } = await supabase
      .from('checklist_items')
      .update({
        contract_template_id: null,
        value: JSON.stringify({
          generated_document_id: generatedDocumentId,
          status: 'pending',
        }),
      })
      .eq('id', checklistItemId)
    if (updateError) throw new Error(updateError.message)
  }

  const pollInviteStatus = (projectId: string) => {
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      const { data } = await supabase
        .from('projects')
        .select('invite_status, invite_sent_at, invite_last_attempt_at')
        .eq('id', projectId)
        .maybeSingle()
      if (cancelled || !data) return
      const status = data.invite_status as ProjectInviteStatus | null
      if (status) setInviteStatus(status)
      if (data.invite_sent_at) setInviteSentAt(data.invite_sent_at)
      if (data.invite_last_attempt_at) setInviteLastAttemptAt(data.invite_last_attempt_at)
      if (status === 'sent' || status === 'failed') return
      window.setTimeout(tick, 1200)
    }
    void tick()
    // Stop polling after 90s
    window.setTimeout(() => {
      cancelled = true
    }, 90_000)
  }

  const startInviteDelivery = (projectId: string, token: string) => {
    setGeneratedToken(token)
    setInviteStatus('pending')
    setInviteSentAt(null)
    setStep(2)
    setLoading(false)
    setLoadingMessage(null)
    void sendProjectInviteEmail({ projectId }).catch(() => {
      // Delivery continues via waitUntil / cron; poll will surface failed
    })
    pollInviteStatus(projectId)
  }

  const handleResendInvite = async () => {
    if (!createdProjectId || inviteResending) return
    const gate = canResendInvite({
      inviteStatus,
      inviteLastAttemptAt,
      inviteSentAt,
    })
    if (!gate.ok) return
    setInviteResending(true)
    try {
      const result = await sendProjectInviteEmail({
        projectId: createdProjectId,
        resend: true,
      })
      setInviteStatus('sent')
      setInviteLastAttemptAt(new Date().toISOString())
      setInviteSentAt(result.invite_sent_at ?? new Date().toISOString())
      pollInviteStatus(createdProjectId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Renvoi impossible.')
    } finally {
      setInviteResending(false)
    }
  }

  const resolveMode = (): ClientResolution => {
    if (clientResolution) return clientResolution
    if (selectedClientId) return fieldsReadOnly ? 'attach' : 'update'
    return 'create'
  }

  const createProjectAndChecklist = async (): Promise<{
    projectId: string
    token: string
    aiLinks: PendingContractLink[]
  }> => {
    // Auth + membership already verified by dashboard session + RPC (auth.uid / user_agency_ids).
    // Avoid serial getUser + agency_members + agencies round-trips (~6s observed in prod).
    const resolvedAgencyId = agencyId ?? agency?.id
    if (!resolvedAgencyId) {
      if (agencySessionLoading) {
        throw new Error('Chargement de ton agence… réessaie dans une seconde.')
      }
      throw new Error('Agence introuvable. Recharge la page ou reconnecte-toi.')
    }

    const mode = resolveMode()
    const clientId =
      mode === 'create' ? null : selectedClientId

    if ((mode === 'attach' || mode === 'update') && !clientId) {
      throw new Error('Client manquant pour ce mode.')
    }

    const result = await createProjectWithClient({
      mode,
      clientId,
      form: wizardForm,
      agencyId: resolvedAgencyId,
      projectName: projectName.trim(),
      clientFullName,
      priceEur,
      items,
    })

    await syncProjectPaymentSettings(result.projectId, { paymentUnlockMode })

    setSelectedClientId(result.clientId)

    const aiLinks: PendingContractLink[] = []
    for (const [index, item] of items.entries()) {
      if (item.type !== 'signature' || item.contractSource !== 'ai_generate') continue
      const itemId = result.itemIds[index]
      if (!itemId) continue
      aiLinks.push({ checklistItemId: itemId, documentId: '' })
    }

    return { projectId: result.projectId, token: result.token, aiLinks }
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
    await syncProjectPaymentSettings(projectId, { paymentUnlockMode })
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
    setLoadingMessage('Régénération du contrat… (jusqu’à 1 min)')
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
    let inviteStarted = false

    try {
      const rpcStarted = performance.now()
      const { projectId, token, aiLinks } = await createProjectAndChecklist()
      console.debug('[new-project] rpcMs', Math.round(performance.now() - rpcStarted))
      setCreatedProjectId(projectId)

      if (aiLinks.length === 0) {
        startInviteDelivery(projectId, token)
        inviteStarted = true
        console.debug('[new-project] toModalMs', Math.round(performance.now() - rpcStarted))
        return
      }

      setPendingContractLinks(aiLinks)
      setLoadingMessage('Génération du contrat par l’IA… (jusqu’à 1 min)')
      await runContractGeneration(projectId, false)
      setContractFinalized(false)
      setStep(3)
    } catch (submissionError) {
      if (submissionError instanceof ClientExistsError) {
        const snap = await loadClientById(submissionError.clientId, false)
        if (snap) {
          setClientEmail(wizardForm.email)
          setEmailConflict(snap)
          setConflictDecision(null)
          setClientMode('new')
          setClientResolution(null)
          setStep(1)
          setError('Ce client existe déjà. Choisis une action ci-dessous.')
        } else {
          setError('Ce client existe déjà. Reviens à l’étape 1 pour le rattacher.')
          setStep(1)
        }
        return
      }
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Une erreur est survenue pendant la création.',
      )
    } finally {
      if (!inviteStarted) {
        setLoading(false)
        setLoadingMessage(null)
      }
    }
  }

  const handleContractFinalized = async (generatedDocumentId: string) => {
    if (!createdProjectId || pendingContractLinks.length === 0) return

    setLoading(true)
    setLoadingMessage('Finalisation…')
    setError(null)
    try {
      for (const link of pendingContractLinks) {
        await linkGeneratedDocumentToChecklistItem(link.checklistItemId, generatedDocumentId)
      }
      setContractFinalized(true)

      const { data: project } = await supabase
        .from('projects')
        .select('token')
        .eq('id', createdProjectId)
        .single()

      if (!project?.token) throw new Error('Projet introuvable.')

      startInviteDelivery(createdProjectId, project.token)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erreur lors de la finalisation.')
      setLoading(false)
      setLoadingMessage(null)
    }
  }

  const handleCopy = async () => {
    if (!onboardingLink) return
    await navigator.clipboard.writeText(onboardingLink)
    setCopySuccess(true)
    window.setTimeout(() => setCopySuccess(false), 1800)
  }

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
    <DashboardLayout
      title="Nouveau projet"
      subtitle={stepSubtitle}
      maxWidth="full"
    >
      <Card className="w-full min-w-0">
        <div className="min-w-0 w-full">
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
          <ClientInfoStep
            clientMode={clientMode}
            onClientModeChange={handleClientModeChange}
            selectedClientId={selectedClientId}
            selectedClientLabel={selectedClientLabel}
            firstName={firstName}
            lastName={lastName}
            clientEmail={clientEmail}
            phone={phone}
            isCompany={isCompany}
            companyName={companyName}
            companyType={companyType}
            siret={siret}
            vatNumber={vatNumber}
            showExtra={showExtra}
            addressStreet={addressStreet}
            postalCode={postalCode}
            city={city}
            country={country}
            website={website}
            industry={industry}
            companySize={companySize}
            notes={notes}
            projectName={projectName}
            fieldErrors={fieldErrors}
            error={error}
            readOnly={fieldsReadOnly}
            emailConflict={emailConflict}
            conflictDecision={conflictDecision}
            mergeChanges={mergeChanges}
            emailLookupLoading={emailLookupLoading}
            clientSearchQuery={clientSearchQuery}
            clientSearchResults={clientSearchResults}
            clientSearchLoading={clientSearchLoading}
            onClientSearchQueryChange={setClientSearchQuery}
            onSelectExistingClient={handleSelectExistingClient}
            onClearSelectedClient={handleClearSelectedClient}
            onEditExistingClient={handleEditExistingClient}
            onConflictAttach={handleConflictAttach}
            onConflictUpdate={handleConflictUpdate}
            onConflictCancel={handleConflictCancel}
            onConflictChangeDecision={handleConflictChangeDecision}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
            onClientEmailChange={(value) => {
              setClientEmail(value)
              if (clientResolution === 'create' || clientResolution === null) {
                setEmailConflict(null)
              }
            }}
            onClientEmailBlur={handleClientEmailBlur}
            onPhoneChange={setPhone}
            onIsCompanyChange={setIsCompany}
            onCompanyNameChange={setCompanyName}
            onCompanyTypeChange={setCompanyType}
            onSiretChange={setSiret}
            onVatNumberChange={setVatNumber}
            onShowExtraToggle={() => setShowExtra(!showExtra)}
            onAddressStreetChange={setAddressStreet}
            onPostalCodeChange={setPostalCode}
            onCityChange={setCity}
            onCountryChange={setCountry}
            onWebsiteChange={setWebsite}
            onIndustryChange={setIndustry}
            onCompanySizeChange={setCompanySize}
            onNotesChange={setNotes}
            onProjectNameChange={(value) => {
              setProjectNameDirty(true)
              setProjectName(value)
            }}
            onCompanySelect={handleCompanySelect}
            onLegalManualEdit={markLegalManualEdit}
            onSubmit={handleStepOneSubmit}
          />
        ) : step === 2 ? (
          <ChecklistStep
            items={items}
            onItemsChange={setItems}
            projectPrice={projectPrice}
            onProjectPriceChange={setProjectPrice}
            paymentUnlockMode={paymentUnlockMode}
            onPaymentUnlockModeChange={setPaymentUnlockMode}
            contractTemplates={contractTemplates}
            agencyTemplates={agencyTemplates}
            agencyId={agencyId}
            aiContractsEnabled={aiContractsEnabled}
            hasDefaultContract={hasDefaultContract}
            defaultContractBrief={defaultContractBrief}
            priceEur={priceEur}
            createdProjectId={createdProjectId}
            needsContractStep={needsContractStep}
            error={error}
            loading={loading}
            loadingMessage={loadingMessage}
            submitLabel={stepTwoButtonLabel}
            onTemplatesChanged={() => {
              if (agencyId) refreshAgencyTemplates(agencyId)
            }}
            onTemplateApplied={handleTemplateApplied}
            onBack={() => setStep(1)}
            onSubmit={handleCreateProject}
          />
        ) : (
          <ContractFinalizeStep
            clientFullName={clientFullName}
            priceEur={priceEur}
            items={items}
            manualBrief={manualBrief}
            onBriefChange={handleBriefChange}
            contextStale={contextStale}
            showContextRecap={showContextRecap}
            onToggleContextRecap={() => setShowContextRecap((value) => !value)}
            generatedDocuments={generatedDocuments}
            generatedToken={generatedToken}
            contractFinalized={contractFinalized}
            regenerating={regenerating}
            loading={loading}
            loadingMessage={loadingMessage}
            error={error}
            onRegenerate={handleRegenerateContract}
            onContractFinalized={handleContractFinalized}
            onPdfCreated={async () => {
              if (!createdProjectId) return
              const docs = await fetchProjectGeneratedDocuments(createdProjectId)
              setGeneratedDocuments(docs)
            }}
            onBackToChecklist={() => setStep(2)}
          />
        )}
        </div>
      </Card>

      {generatedToken ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/45 px-4">
          <Card className="w-full max-w-xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
              Lien généré
            </h2>
            <p className="mt-2 text-sm font-body text-[var(--ink-muted)]" role="status" aria-live="polite">
              {inviteStatus === 'sent' ? (
                <>
                  Invitation envoyée
                  {formatInviteSentAt(inviteSentAt) ? ` le ${formatInviteSentAt(inviteSentAt)}` : ''} ✓
                </>
              ) : inviteStatus === 'failed' ? (
                <>
                  Échec de l&apos;envoi —{' '}
                  <button
                    type="button"
                    className="font-medium text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-50"
                    onClick={() => void handleResendInvite()}
                    disabled={
                      inviteResending ||
                      !canResendInvite({ inviteStatus, inviteLastAttemptAt, inviteSentAt }).ok
                    }
                  >
                    {inviteResending ? 'Envoi…' : 'Renvoyer'}
                  </button>
                </>
              ) : (
                <>Invitation en cours d&apos;envoi à {clientEmail.trim()}…</>
              )}
            </p>
            <p className="mt-4 break-all rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3 text-left text-sm font-body text-[var(--ink)]">
              {onboardingLink}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button onClick={handleCopy}>{copySuccess ? 'Copie effectuée' : 'Copier le lien'}</Button>
              {selectedClientId ? (
                <Link to={`/dashboard/client/${selectedClientId}`} className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full">Retour à la fiche client</Button>
                </Link>
              ) : (
                <Link to="/dashboard" className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full">Retour au dashboard</Button>
                </Link>
              )}
              <Button className="w-full" variant="secondary" onClick={() => navigate(`/p/${generatedToken}`)}>
                Ouvrir le portail
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {loading && !generatedToken ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--ink)]/35 px-4">
          <Card className="w-full max-w-sm text-center">
            <div
              className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"
              aria-hidden
            />
            <p className="mt-4 text-sm font-body text-[var(--ink)]">
              {loadingMessage ?? 'Chargement…'}
            </p>
          </Card>
        </div>
      ) : null}
    </DashboardLayout>
  )
}
