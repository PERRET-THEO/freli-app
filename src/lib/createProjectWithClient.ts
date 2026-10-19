import { supabase } from './supabase'
import {
  buildClientCreatePayload,
  buildClientMergePatch,
  parseCreateProjectRpcError,
  type ClientResolution,
  type ClientWizardForm,
} from './clientWizard'
import {
  buildChecklistItemConfig,
  buildChecklistItemValue,
  type DraftChecklistItem,
} from './checklist'

export type CreateProjectWithClientResult = {
  projectId: string
  token: string
  clientId: string
  itemIds: string[]
}

export async function createProjectWithClient(opts: {
  mode: ClientResolution
  clientId: string | null
  form: ClientWizardForm
  agencyId: string
  projectName: string
  clientFullName: string
  priceEur: number | null
  items: DraftChecklistItem[]
}): Promise<CreateProjectWithClientResult> {
  if (!opts.items.length) {
    throw new Error('Ajoute au moins un item de checklist.')
  }

  const token = crypto.randomUUID()
  const email = opts.form.email.trim().toLowerCase()

  let clientPayload: Record<string, unknown>
  if (opts.mode === 'attach') {
    clientPayload = { email }
  } else if (opts.mode === 'update') {
    clientPayload = buildClientMergePatch(opts.form)
  } else {
    clientPayload = buildClientCreatePayload(opts.form, opts.agencyId)
    // agency_id is taken from p_project; avoid confusion
    delete clientPayload.agency_id
  }

  const projectPayload: Record<string, unknown> = {
    agency_id: opts.agencyId,
    name: opts.projectName.trim(),
    client_name: opts.clientFullName,
    client_email: email,
    token,
  }
  if (opts.priceEur != null) projectPayload.price = opts.priceEur

  const itemsPayload = opts.items.map((item, index) => ({
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
    config: buildChecklistItemConfig(item, opts.items),
  }))

  const { data, error } = await supabase.rpc('create_project_with_client', {
    p_mode: opts.mode,
    p_client_id: opts.clientId,
    p_client: clientPayload,
    p_project: projectPayload,
    p_items: itemsPayload,
  })

  if (error) throw parseCreateProjectRpcError(error)

  const row = data as {
    project_id: string
    token: string
    client_id: string
    item_ids: string[]
  }

  if (!row?.project_id || !row?.token) {
    throw new Error('Réponse invalide lors de la création du projet.')
  }

  return {
    projectId: row.project_id,
    token: row.token,
    clientId: row.client_id,
    itemIds: Array.isArray(row.item_ids) ? row.item_ids : [],
  }
}
